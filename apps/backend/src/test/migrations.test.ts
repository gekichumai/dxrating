import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { is } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import * as appSchema from '../db/schema'
import * as authSchema from '../db/auth-schema'

const backendDirectory = path.resolve(import.meta.dirname, '../..')
const migrations = readMigrationFiles({ migrationsFolder: path.join(backendDirectory, 'drizzle') })
const expectedTables = Object.values({ ...appSchema, ...authSchema })
  .flatMap((value) => {
    if (!is(value, PgTable)) return []
    const table = getTableConfig(value)
    return [`${table.schema ?? 'public'}.${table.name}`]
  })
  .toSorted()
const testUrl = new URL(process.env.DATABASE_URL!)
const adminUrl = new URL(testUrl)
adminUrl.pathname = '/postgres'
const admin = new Pool({ connectionString: adminUrl.toString() })
const databases = new Set<string>()

const createFixture = async (kind: string) => {
  const name = `dxrating_effect4_${kind}_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE DATABASE "${name}"`)
  databases.add(name)
  const url = new URL(testUrl)
  url.pathname = `/${name}`
  return { url: url.toString(), pool: new Pool({ connectionString: url.toString() }) }
}

const migrate = (url: string) => {
  execFileSync(process.execPath, ['src/migrate.ts'], {
    cwd: backendDirectory,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 15_000,
  })
}

const ledger = (pool: Pool) =>
  pool.query('SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id').then((result) => result.rows)

const applicationTables = (pool: Pool) =>
  pool
    .query(`
    SELECT n.nspname AS schema, c.relname AS name, c.oid
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'arcade') AND c.relkind = 'r'
    ORDER BY n.nspname, c.relname
  `)
    .then((result) => result.rows)

afterAll(async () => {
  try {
    for (const name of databases) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
})

describe('native Effect deployment migrations', () => {
  it('initializes the complete schema and is idempotent on a fresh database', async () => {
    const fixture = await createFixture('fresh')
    try {
      migrate(fixture.url)
      const applied = await ledger(fixture.pool)
      expect(applied).toHaveLength(migrations.length)
      expect(
        (await applicationTables(fixture.pool)).map((table) => `${table.schema}.${table.name}`).toSorted(),
      ).toEqual(expectedTables)
      expect(
        (
          await fixture.pool.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tags' AND column_name = 'localized_name'
      `)
        ).rows,
      ).toEqual([{ data_type: 'jsonb' }])
      migrate(fixture.url)
      expect(await ledger(fixture.pool)).toEqual(applied)
    } finally {
      await fixture.pool.end()
    }
  })

  it('upgrades an old ledger without replaying SQL or changing application tables and rows', async () => {
    const fixture = await createFixture('legacy')
    try {
      migrate(fixture.url)
      await fixture.pool.query('INSERT INTO public."user" (id, name, email) VALUES ($1, $2, $3)', [
        'migration-sentinel',
        'Preserved fixture',
        'migration@example.invalid',
      ])
      const localizedTagsMigration = migrations.find((migration) =>
        migration.name?.endsWith('_localized_tags_to_jsonb'),
      )
      expect(localizedTagsMigration).toBeDefined()
      // The original journal put this migration in March 2025 despite requiring
      // January 2026 tables. Its generated folder now follows its prerequisites;
      // existing ledgers must match its unchanged SQL hash instead of its date.
      await fixture.pool.query(
        'UPDATE drizzle.__drizzle_migrations SET created_at = CASE WHEN name = $1 THEN $2 ELSE created_at + 123 END',
        [localizedTagsMigration!.name, 1742054400000],
      )
      await fixture.pool.query('ALTER TABLE drizzle.__drizzle_migrations DROP COLUMN name, DROP COLUMN applied_at')
      const beforeLedger = await ledger(fixture.pool)
      const beforeTables = await applicationTables(fixture.pool)
      const readSentinel = () =>
        fixture.pool
          .query('SELECT * FROM public."user" WHERE id = $1', ['migration-sentinel'])
          .then((result) => result.rows)
      const beforeSentinel = await readSentinel()

      migrate(fixture.url)
      expect(await ledger(fixture.pool)).toEqual(beforeLedger)
      expect(await applicationTables(fixture.pool)).toEqual(beforeTables)
      expect(await readSentinel()).toEqual(beforeSentinel)
      const names = await fixture.pool.query('SELECT name, applied_at FROM drizzle.__drizzle_migrations ORDER BY id')
      expect(names.rows).toEqual(migrations.map((migration) => ({ name: migration.name, applied_at: null })))

      migrate(fixture.url)
      expect(await ledger(fixture.pool)).toEqual(beforeLedger)
      expect(await readSentinel()).toEqual(beforeSentinel)
    } finally {
      await fixture.pool.end()
    }
  })
})