import { spawn, type ChildProcess } from 'node:child_process'
import * as path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BACKEND_MIGRATION_ADVISORY_LOCK_ID } from './migration-runner.js'

const runCompiledTests = process.env.MIGRATION_COMPILED_TEST === '1'
const describeCompiled = runCompiledTests ? describe : describe.skip

const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Compiled migration tests require the configured dxrating_test database')
}
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = '/dxrating_migration_cli_test'
const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const compiledMigrationPath = path.resolve(__dirname, '../../dist/migrate.js')
const nodeMajorVersion = Number(process.versions.node.split('.')[0])
const nodeArguments = ['--enable-source-maps', ...(nodeMajorVersion < 26 ? ['--experimental-transform-types'] : [])]

type CliResult = { code: number | null; signal: NodeJS.Signals | null; stderr: string }

const spawnMigrationCli = (extraEnvironment: NodeJS.ProcessEnv = {}, cliArguments: string[] = []) => {
  const child = spawn(process.execPath, [...nodeArguments, compiledMigrationPath, ...cliArguments], {
    env: {
      ...process.env,
      DATABASE_URL: migrationDatabaseUrl.toString(),
      ...extraEnvironment,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-16_384)
  })
  const result = new Promise<CliResult>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal, stderr }))
  })
  return { child, result }
}

const runMigrationCli = async (extraEnvironment: NodeJS.ProcessEnv = {}, cliArguments: string[] = []) =>
  spawnMigrationCli(extraEnvironment, cliArguments).result

const waitForMigrationProcess = async (pool: Pool, child: ChildProcess) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) return false
    const result = await pool.query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database()
            AND application_name = 'dxrating-backend-migration'
       ) AS found`,
    )
    if (result.rows[0]?.found) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}

describeCompiled('compiled backend migration CLI', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const inspectionPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })

  beforeAll(async () => {
    await adminPool.query('DROP DATABASE IF EXISTS dxrating_migration_cli_test WITH (FORCE)')
    await adminPool.query('CREATE DATABASE dxrating_migration_cli_test')
  })

  afterAll(async () => {
    await inspectionPool.end()
    await adminPool.query('DROP DATABASE IF EXISTS dxrating_migration_cli_test WITH (FORCE)')
    await adminPool.end()
  })

  it('applies a fresh journal and is idempotent when repeated', async () => {
    expect(await runMigrationCli()).toMatchObject({ code: 0, signal: null })
    expect(await runMigrationCli()).toMatchObject({ code: 0, signal: null })
  })

  it('returns nonzero after the bounded advisory-lock timeout', async () => {
    const holder = await inspectionPool.connect()
    await holder.query('SELECT pg_advisory_lock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
    try {
      const result = await runMigrationCli({
        MIGRATION_LOCK_TIMEOUT_MS: '100',
        MIGRATION_LOCK_RETRY_MS: '10',
      })
      expect(result).toMatchObject({ code: 1, signal: null })
      expect(result.stderr).toContain('MigrationLockTimeoutError')
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
      holder.release()
    }
  })

  it('maps SIGTERM to exit 143 while safely abandoning lock acquisition', async () => {
    const holder = await inspectionPool.connect()
    await holder.query('SELECT pg_advisory_lock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
    try {
      const invocation = spawnMigrationCli({
        MIGRATION_LOCK_TIMEOUT_MS: '10000',
        MIGRATION_LOCK_RETRY_MS: '20',
      })
      expect(await waitForMigrationProcess(inspectionPool, invocation.child)).toBe(true)
      invocation.child.kill('SIGTERM')
      const result = await invocation.result
      expect(result).toMatchObject({ code: 143, signal: null })
      expect(result.stderr).toContain('Backend migration job interrupted')
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1::bigint)', [BACKEND_MIGRATION_ADVISORY_LOCK_ID])
      holder.release()
    }
  })

  it('returns nonzero rather than baselining generated schema without its ledger', async () => {
    await inspectionPool.query('DELETE FROM drizzle.__drizzle_migrations')
    const result = await runMigrationCli()
    expect(result).toMatchObject({ code: 1, signal: null })
    expect(result.stderr).toContain('GeneratedMigrationLedgerIntegrityError')
  })
})