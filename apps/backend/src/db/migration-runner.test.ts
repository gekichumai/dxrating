import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadBackendMigrationConfig } from './migration-config.js'
import {
  GeneratedMigrationLedgerIntegrityError,
  LegacyMigrationReconciliationRequiredError,
  preflightGeneratedMigrationLedger,
} from './migration-ledger.js'
import {
  BACKEND_MIGRATION_ADVISORY_LOCK_ID,
  MigrationLockTimeoutError,
  runBackendMigrations,
  type MigrationLogEvent,
  type MigrationLogger,
} from './migration-runner.js'
import {
  assertAppliedMigrationsFormManifestPrefix,
  countSqlStatements,
  NonTransactionalMigrationIntegrityError,
  runNonTransactionalMigrations,
} from './non-transactional-migrations.js'

const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Migration integration tests require the configured dxrating_test database')
}
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = '/dxrating_migration_runner_test'
const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const databaseUrl = migrationDatabaseUrl.toString()
const baseConfig = loadBackendMigrationConfig(
  {
    migrationsFolder: path.resolve(__dirname, '../../drizzle'),
    nonTransactionalMigrationsFolder: path.resolve(__dirname, '../../non-transactional-migrations'),
  },
  { ...process.env, DATABASE_URL: databaseUrl },
)
const fixtureFolder = path.resolve(__dirname, '../test/fixtures/non-transactional-migrations')
const badFixtureFolder = path.resolve(__dirname, '../test/fixtures/non-transactional-migrations-invalid')
const multipleStatementFixtureFolder = path.resolve(__dirname, '../test/fixtures/non-transactional-migrations-multiple')
const orphanFixtureFolder = path.resolve(__dirname, '../test/fixtures/non-transactional-migrations-orphan')
const failingGeneratedFixtureFolder = path.resolve(__dirname, '../test/fixtures/generated-migrations-failure')
const fixtureMigrationId = '9000_test_concurrent_index'

const events: MigrationLogEvent[] = []
const logger: MigrationLogger = {
  info: (event) => events.push(event),
  error: (event) => events.push(event),
}

const delay = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs))

describe('locked backend migration runner', () => {
  const inspectionPool = new Pool({ connectionString: databaseUrl })
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })

  beforeAll(async () => {
    await adminPool.query('DROP DATABASE IF EXISTS dxrating_migration_runner_test WITH (FORCE)')
    await adminPool.query('CREATE DATABASE dxrating_migration_runner_test')
    await runBackendMigrations(baseConfig, { logger })
    await inspectionPool.query('DROP TABLE IF EXISTS public.migration_runner_fixture')
    await inspectionPool.query('DELETE FROM drizzle.__dxrating_non_transactional_migrations WHERE id = $1', [
      fixtureMigrationId,
    ])
  })

  afterAll(async () => {
    await inspectionPool.query('DROP TABLE IF EXISTS public.migration_runner_fixture')
    await inspectionPool.query('DELETE FROM drizzle.__dxrating_non_transactional_migrations WHERE id = $1', [
      fixtureMigrationId,
    ])
    await inspectionPool.end()
    await adminPool.query('DROP DATABASE IF EXISTS dxrating_migration_runner_test WITH (FORCE)')
    await adminPool.end()
  })

  it('uses the Drizzle journal as the authoritative generated migration list', async () => {
    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    const applied = await inspectionPool.query<{ created_at: string }>(
      'SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY id',
    )

    expect(applied.rows.map((row) => Number(row.created_at))).toEqual(
      journal.default.entries.map((entry) => entry.when),
    )
  })

  it('fails closed when generated schema exists without a migration ledger', async () => {
    const client = await inspectionPool.connect()
    await client.query('BEGIN')
    try {
      await client.query('DELETE FROM drizzle.__drizzle_migrations')
      await expect(
        preflightGeneratedMigrationLedger({
          client,
          migrationsFolder: baseConfig.migrationsFolder,
        }),
      ).rejects.toBeInstanceOf(GeneratedMigrationLedgerIntegrityError)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('detects a generated migration hash drift', async () => {
    const client = await inspectionPool.connect()
    await client.query('BEGIN')
    try {
      await client.query(
        `UPDATE drizzle.__drizzle_migrations
            SET hash = repeat('f', 64)
          WHERE hash = 'fdd99d4ddb7d326a9b912f0d58fc6884520fe1829e5f8abc874d1aea7904d6c3'`,
      )
      await expect(
        preflightGeneratedMigrationLedger({
          client,
          migrationsFolder: baseConfig.migrationsFolder,
        }),
      ).rejects.toBeInstanceOf(GeneratedMigrationLedgerIntegrityError)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('detects an unsupported historical journal hole', async () => {
    const client = await inspectionPool.connect()
    await client.query('BEGIN')
    try {
      await client.query(
        `DELETE FROM drizzle.__drizzle_migrations
          WHERE hash = 'fdd99d4ddb7d326a9b912f0d58fc6884520fe1829e5f8abc874d1aea7904d6c3'`,
      )
      await expect(
        preflightGeneratedMigrationLedger({
          client,
          migrationsFolder: baseConfig.migrationsFolder,
        }),
      ).rejects.toBeInstanceOf(GeneratedMigrationLedgerIntegrityError)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('requires an explicit flag before reconciling the known 0003 timestamp hole', async () => {
    const client = await inspectionPool.connect()
    const migrationId = '0003_localized_tags_to_jsonb'
    const migrationHash = 'acaaecad7627fdb1420292709f70795aabddf909e007f46887d5ed71abf0cdfe'
    try {
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1', [migrationHash])
      await expect(
        preflightGeneratedMigrationLedger({
          client,
          migrationsFolder: baseConfig.migrationsFolder,
        }),
      ).rejects.toMatchObject({
        name: 'LegacyMigrationReconciliationRequiredError',
        migrationIds: [migrationId],
      })

      const reconciled: string[] = []
      await preflightGeneratedMigrationLedger({
        client,
        migrationsFolder: baseConfig.migrationsFolder,
        allowLegacyReconciliation: true,
        onReconciled: (id) => reconciled.push(id),
      })
      expect(reconciled).toEqual([migrationId])
      const restored = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations WHERE hash = $1',
        [migrationHash],
      )
      expect(restored.rows[0]?.count).toBe('1')
    } finally {
      client.release()
    }
  })

  it('verifies the resulting schema before reconciling the historical 0004 fingerprint', async () => {
    const client = await inspectionPool.connect()
    const currentHash = '9b1ec4faea7e65d2184785e941403ab370fda445da98676cfe84aa0e85e57a45'
    const legacyHash = '055d6c11d23670b8f7e76fbe9f2d415d605eed61516200165234f1d4b2b4aa26'
    try {
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1', [currentHash])
      await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [
        legacyHash,
        1742691600000,
      ])
      await expect(
        preflightGeneratedMigrationLedger({
          client,
          migrationsFolder: baseConfig.migrationsFolder,
        }),
      ).rejects.toBeInstanceOf(LegacyMigrationReconciliationRequiredError)

      await client.query('ALTER TABLE public.lxns_oauth_tokens ALTER COLUMN created_at DROP DEFAULT')
      await expect(
        preflightGeneratedMigrationLedger({
          client,
          migrationsFolder: baseConfig.migrationsFolder,
          allowLegacyReconciliation: true,
        }),
      ).rejects.toBeInstanceOf(GeneratedMigrationLedgerIntegrityError)
      await client.query('ALTER TABLE public.lxns_oauth_tokens ALTER COLUMN created_at SET DEFAULT now()')

      await preflightGeneratedMigrationLedger({
        client,
        migrationsFolder: baseConfig.migrationsFolder,
        allowLegacyReconciliation: true,
      })
      const restored = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations WHERE hash = $1',
        [currentHash],
      )
      expect(restored.rows[0]?.count).toBe('1')
    } finally {
      await client.query('ALTER TABLE public.lxns_oauth_tokens ALTER COLUMN created_at SET DEFAULT now()')
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1', [legacyHash])
      client.release()
    }
  })

  it('verifies the resulting schema before reconciling the historical 0008 fingerprint', async () => {
    const client = await inspectionPool.connect()
    const currentHash = '86f321b7fddc16c59d167b956349c4812c85575ef8b1d4090efaa56982679d27'
    const legacyHash = 'b5d1fb99a186152fa6b01949508c5fa58bddae6cae2221201b9a4270bd862cc2'
    try {
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1', [currentHash])
      await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [
        legacyHash,
        1785534392377,
      ])
      await expect(
        preflightGeneratedMigrationLedger({
          client,
          migrationsFolder: baseConfig.migrationsFolder,
        }),
      ).rejects.toBeInstanceOf(LegacyMigrationReconciliationRequiredError)

      await preflightGeneratedMigrationLedger({
        client,
        migrationsFolder: baseConfig.migrationsFolder,
        allowLegacyReconciliation: true,
      })
      const restored = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations WHERE hash = $1',
        [currentHash],
      )
      expect(restored.rows[0]?.count).toBe('1')
    } finally {
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1', [legacyHash])
      client.release()
    }
  })

  it('serializes two concurrent jobs', async () => {
    let active = 0
    let maximumActive = 0
    const operation = async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await delay(75)
      active -= 1
    }

    await Promise.all([
      runBackendMigrations({ ...baseConfig, lockRetryMs: 10 }, { logger, operation }),
      runBackendMigrations({ ...baseConfig, lockRetryMs: 10 }, { logger, operation }),
    ])

    expect(maximumActive).toBe(1)
  })

  it('times out without executing while another session owns the lock', async () => {
    const lockClient = await inspectionPool.connect()
    const operation = vi.fn(async () => undefined)
    await lockClient.query('SELECT pg_advisory_lock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])

    try {
      await expect(
        runBackendMigrations({ ...baseConfig, lockTimeoutMs: 100, lockRetryMs: 10 }, { logger, operation }),
      ).rejects.toBeInstanceOf(MigrationLockTimeoutError)
      expect(operation).not.toHaveBeenCalled()
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
      lockClient.release()
    }
  })

  it('releases its session lock when the operation fails', async () => {
    await expect(
      runBackendMigrations(baseConfig, {
        logger,
        operation: async () => {
          throw new Error('fixture migration failure')
        },
      }),
    ).rejects.toThrow('fixture migration failure')

    const probe = await inspectionPool.connect()
    try {
      const result = await probe.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [
        BACKEND_MIGRATION_ADVISORY_LOCK_ID,
      ])
      expect(result.rows[0]?.acquired).toBe(true)
      await probe.query('SELECT pg_advisory_unlock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
    } finally {
      probe.release()
    }
  })

  it('rolls back failed generated DDL and its ledger entry', async () => {
    const failedDatabaseUrl = new URL(configuredDatabaseUrl)
    failedDatabaseUrl.pathname = '/dxrating_generated_migration_failure_test'
    await adminPool.query('DROP DATABASE IF EXISTS dxrating_generated_migration_failure_test WITH (FORCE)')
    await adminPool.query('CREATE DATABASE dxrating_generated_migration_failure_test')

    const failureConfig = {
      ...baseConfig,
      databaseUrl: failedDatabaseUrl.toString(),
      migrationsFolder: failingGeneratedFixtureFolder,
    }
    const failurePool = new Pool({ connectionString: failedDatabaseUrl.toString() })
    try {
      await expect(runBackendMigrations(failureConfig, { logger })).rejects.toThrow()
      const state = await failurePool.query<{ relation: string | null; ledger_count: string }>(
        `SELECT to_regclass('public.generated_failure_fixture')::text AS relation,
                (SELECT count(*)::text FROM drizzle.__drizzle_migrations) AS ledger_count`,
      )
      expect(state.rows[0]).toEqual({ relation: null, ledger_count: '0' })
    } finally {
      await failurePool.end()
      await adminPool.query('DROP DATABASE IF EXISTS dxrating_generated_migration_failure_test WITH (FORCE)')
    }
  })

  it('aborts bounded lock acquisition without running the operation', async () => {
    const lockClient = await inspectionPool.connect()
    const controller = new AbortController()
    const operation = vi.fn(async () => undefined)
    await lockClient.query('SELECT pg_advisory_lock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])

    try {
      setTimeout(() => controller.abort(), 40)
      await expect(
        runBackendMigrations(
          { ...baseConfig, lockTimeoutMs: 1000, lockRetryMs: 20 },
          { logger, signal: controller.signal, operation },
        ),
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(operation).not.toHaveBeenCalled()
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
      lockClient.release()
    }
  })

  it('destroys the active migration session on interruption and rolls back its transaction', async () => {
    const controller = new AbortController()
    let markOperationStarted: (() => void) | undefined
    const operationStarted = new Promise<void>((resolve) => {
      markOperationStarted = resolve
    })
    const run = runBackendMigrations(baseConfig, {
      logger,
      signal: controller.signal,
      operation: async (client) => {
        await client.query('BEGIN')
        await client.query('CREATE TABLE public.interrupted_migration_fixture (id bigint PRIMARY KEY)')
        markOperationStarted?.()
        await client.query('SELECT pg_sleep(30)')
        await client.query('COMMIT')
      },
    })

    await operationStarted
    const interruptedAt = performance.now()
    controller.abort()
    await expect(run).rejects.toThrow()
    expect(performance.now() - interruptedAt).toBeLessThan(2_000)

    const probe = await inspectionPool.connect()
    try {
      let acquired = false
      for (let attempt = 0; attempt < 80 && !acquired; attempt += 1) {
        const lock = await probe.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [
          BACKEND_MIGRATION_ADVISORY_LOCK_ID,
        ])
        acquired = lock.rows[0]?.acquired === true
        if (!acquired) await delay(25)
      }
      expect(acquired).toBe(true)
      const table = await probe.query<{ relation: string | null }>(
        `SELECT to_regclass('public.interrupted_migration_fixture')::text AS relation`,
      )
      expect(table.rows[0]?.relation).toBeNull()
      await probe.query('SELECT pg_advisory_unlock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
    } finally {
      probe.release()
    }
  })

  it('recovers the reviewed non-transactional ledger after DDL succeeded but recording did not', async () => {
    events.length = 0
    await inspectionPool.query(
      'CREATE TABLE public.migration_runner_fixture (id bigint PRIMARY KEY, value text NOT NULL)',
    )

    const operation = await readFile(path.join(fixtureFolder, '9000_test_concurrent_index.sql'), 'utf8')
    await inspectionPool.query(operation)

    const client = await inspectionPool.connect()
    try {
      await runNonTransactionalMigrations({
        client,
        migrationsFolder: fixtureFolder,
        logger,
      })
      await runNonTransactionalMigrations({
        client,
        migrationsFolder: fixtureFolder,
        logger,
      })
    } finally {
      client.release()
    }

    const ledger = await inspectionPool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM drizzle.__dxrating_non_transactional_migrations WHERE id = $1',
      [fixtureMigrationId],
    )
    const index = await inspectionPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'migration_runner_fixture'`,
    )
    expect(ledger.rows[0]?.count).toBe('1')
    expect(index.rows.map((row) => row.indexname)).toContain('migration_runner_fixture_value_idx')
    expect(events).toContainEqual({ kind: 'non_transactional_skipped', migrationId: fixtureMigrationId })
  })

  it('fails rather than recording an invalid same-name concurrent index', async () => {
    await inspectionPool.query('DROP TABLE IF EXISTS public.migration_runner_fixture')
    await inspectionPool.query('DELETE FROM drizzle.__dxrating_non_transactional_migrations WHERE id = $1', [
      fixtureMigrationId,
    ])
    await inspectionPool.query(
      'CREATE TABLE public.migration_runner_fixture (id bigint PRIMARY KEY, value text NOT NULL)',
    )
    await inspectionPool.query(
      `INSERT INTO public.migration_runner_fixture (id, value) VALUES (1, 'duplicate'), (2, 'duplicate')`,
    )
    await expect(
      inspectionPool.query(
        'CREATE UNIQUE INDEX CONCURRENTLY migration_runner_fixture_value_idx ON public.migration_runner_fixture (value)',
      ),
    ).rejects.toThrow()

    const invalid = await inspectionPool.query<{ valid: boolean; ready: boolean }>(
      `SELECT indisvalid AS valid, indisready AS ready
         FROM pg_index
        WHERE indexrelid = 'public.migration_runner_fixture_value_idx'::regclass`,
    )
    expect(invalid.rows[0]).toMatchObject({ valid: false })

    const client = await inspectionPool.connect()
    try {
      await expect(
        runNonTransactionalMigrations({
          client,
          migrationsFolder: fixtureFolder,
          logger,
        }),
      ).rejects.toBeInstanceOf(NonTransactionalMigrationIntegrityError)
    } finally {
      client.release()
    }
  })

  it.each([
    'CREATE UNIQUE INDEX migration_runner_fixture_value_idx ON public.migration_runner_fixture (value)',
    'CREATE INDEX migration_runner_fixture_value_idx ON public.migration_runner_fixture (value) INCLUDE (id)',
    `CREATE INDEX migration_runner_fixture_value_idx ON public.migration_runner_fixture (value) WHERE value <> ''`,
  ])('rejects a valid same-name index with the wrong reviewed definition', async (wrongIndexSql) => {
    await inspectionPool.query('DROP TABLE IF EXISTS public.migration_runner_fixture')
    await inspectionPool.query('DELETE FROM drizzle.__dxrating_non_transactional_migrations WHERE id = $1', [
      fixtureMigrationId,
    ])
    await inspectionPool.query(
      'CREATE TABLE public.migration_runner_fixture (id bigint PRIMARY KEY, value text NOT NULL)',
    )
    await inspectionPool.query(wrongIndexSql)

    const client = await inspectionPool.connect()
    try {
      await expect(
        runNonTransactionalMigrations({
          client,
          migrationsFolder: fixtureFolder,
          logger,
        }),
      ).rejects.toBeInstanceOf(NonTransactionalMigrationIntegrityError)
    } finally {
      client.release()
      await inspectionPool.query('DROP INDEX IF EXISTS public.migration_runner_fixture_value_idx')
    }
  })

  it('rejects applied non-transactional migrations absent from the current manifest', async () => {
    await inspectionPool.query(
      `INSERT INTO drizzle.__dxrating_non_transactional_migrations
         (id, operation_sha256, verification_sha256, duration_ms)
       VALUES ($1, $2, $3, 0)`,
      ['8999_unknown_applied_migration', 'a'.repeat(64), 'b'.repeat(64)],
    )

    const client = await inspectionPool.connect()
    try {
      await expect(
        runNonTransactionalMigrations({
          client,
          migrationsFolder: fixtureFolder,
          logger,
        }),
      ).rejects.toThrow('absent from this runner')
    } finally {
      client.release()
      await inspectionPool.query('DELETE FROM drizzle.__dxrating_non_transactional_migrations WHERE id = $1', [
        '8999_unknown_applied_migration',
      ])
    }
  })

  it('rejects more than one reviewed SQL statement', () => {
    expect(countSqlStatements(`SELECT ';'::text; /* nested ; */ SELECT 2`)).toBe(2)
    expect(countSqlStatements(`DO $$ BEGIN PERFORM ';'; END $$;`)).toBe(1)
  })

  it('rejects a non-transactional ledger hole instead of applying an older operation out of order', () => {
    expect(() =>
      assertAppliedMigrationsFormManifestPrefix(
        ['9000_first_reviewed_operation', '9001_second_reviewed_operation'],
        ['9001_second_reviewed_operation'],
      ),
    ).toThrow('exact prefix')
  })

  it('fails closed on a digest-pinned file containing multiple statements', async () => {
    const client = await inspectionPool.connect()
    try {
      await expect(
        runNonTransactionalMigrations({
          client,
          migrationsFolder: multipleStatementFixtureFolder,
          logger,
        }),
      ).rejects.toBeInstanceOf(NonTransactionalMigrationIntegrityError)
    } finally {
      client.release()
    }
  })

  it('fails closed on an orphan SQL file outside the reviewed manifest', async () => {
    const client = await inspectionPool.connect()
    try {
      await expect(
        runNonTransactionalMigrations({
          client,
          migrationsFolder: orphanFixtureFolder,
          logger,
        }),
      ).rejects.toBeInstanceOf(NonTransactionalMigrationIntegrityError)
    } finally {
      client.release()
    }
  })

  it('fails closed when reviewed SQL does not match the manifest digest', async () => {
    const client = await inspectionPool.connect()
    try {
      await expect(
        runNonTransactionalMigrations({
          client,
          migrationsFolder: badFixtureFolder,
          logger,
        }),
      ).rejects.toBeInstanceOf(NonTransactionalMigrationIntegrityError)
    } finally {
      client.release()
    }
  })
})