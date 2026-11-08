// Migration round trip: up -> every down.sql in reverse -> up.
//
// Each migration folder from 20261103 onward carries a hand-written down.sql
// that the Drizzle migrator never reads. This check proves, on throwaway
// databases next to the test database, that:
//   1. applying every down.sql (newest first) restores exactly the schema and
//      ledger of a database migrated only up to the newest folder without one;
//   2. migrating again afterwards rebuilds exactly the original schema.
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { assertSafeTestDatabaseUrl } from './test-database-safety'

const backendDirectory = path.resolve(import.meta.dirname, '../..')
const migrationsDirectory = path.join(backendDirectory, 'drizzle')
const migrateScript = path.join(backendDirectory, 'src/migrate.ts')

export interface RoundTripReport {
  readonly reverted: readonly string[]
}

const migrationFolders = () =>
  readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

/** Folders whose down.sql must run, newest first; every folder after the last one without down.sql. */
export const reversibleMigrations = (folders = migrationFolders()) => {
  const reversible: string[] = []
  for (const folder of [...folders].reverse()) {
    if (!existsSync(path.join(migrationsDirectory, folder, 'down.sql'))) break
    reversible.push(folder)
  }
  return reversible
}

const migrate = (url: string, cwd = backendDirectory) => {
  execFileSync(process.execPath, [migrateScript], {
    cwd,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30_000,
  })
}

/** Migrates with only the given folders, through a temporary copy of the migrations directory. */
const migrateWith = (url: string, folders: readonly string[]) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'dxrating-migrations-'))
  try {
    for (const folder of folders) {
      cpSync(path.join(migrationsDirectory, folder), path.join(directory, 'drizzle', folder), { recursive: true })
    }
    migrate(url, directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/** A canonical description of every table, column, constraint and index outside the ledger schema. */
export const describeSchema = async (pool: Pool) => {
  const schemas = `n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle') AND n.nspname NOT LIKE 'pg_toast%'`
  const [namespaces, columns, constraints, indexes, sequences] = await Promise.all([
    pool.query(`SELECT n.nspname FROM pg_namespace n WHERE ${schemas} ORDER BY 1`),
    pool.query(`
      SELECT n.nspname, c.relname, a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull,
             pg_get_expr(d.adbin, d.adrelid) AS default
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE ${schemas} AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY 1, 2, 3`),
    pool.query(`
      SELECT n.nspname, c.relname, k.conname, pg_get_constraintdef(k.oid) AS definition
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${schemas}
      ORDER BY 1, 2, 3`),
    pool.query(`
      SELECT n.nspname, i.tablename, i.indexname, i.indexdef
      FROM pg_indexes i JOIN pg_namespace n ON n.nspname = i.schemaname
      WHERE ${schemas}
      ORDER BY 1, 2, 3`),
    pool.query(`
      SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${schemas} AND c.relkind = 'S' ORDER BY 1, 2`),
  ])
  return {
    namespaces: namespaces.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    sequences: sequences.rows,
  }
}

const ledgerNames = (pool: Pool) =>
  pool
    .query<{ name: string }>('SELECT name FROM drizzle.__drizzle_migrations ORDER BY id')
    .then((result) => result.rows.map((row) => row.name))

const assertEqual = (label: string, actual: unknown, expected: unknown) => {
  const actualJson = JSON.stringify(actual, null, 2)
  const expectedJson = JSON.stringify(expected, null, 2)
  if (actualJson !== expectedJson) {
    throw new Error(`${label} differs.\nExpected:\n${expectedJson}\nActual:\n${actualJson}`)
  }
}

export const runMigrationRoundTrip = async (databaseUrl: string): Promise<RoundTripReport> => {
  assertSafeTestDatabaseUrl(databaseUrl)
  const folders = migrationFolders()
  const reverted = reversibleMigrations(folders)
  if (reverted.length === 0) throw new Error('No migration folder has a down.sql')
  const baseFolders = folders.slice(0, folders.length - reverted.length)

  const adminUrl = new URL(databaseUrl)
  adminUrl.pathname = '/postgres'
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  const created: string[] = []
  const pools: Pool[] = []
  const fixture = async (kind: string) => {
    const name = `dxrating_roundtrip_${kind}_${randomUUID().replaceAll('-', '')}`
    await admin.query(`CREATE DATABASE "${name}"`)
    created.push(name)
    const url = new URL(databaseUrl)
    url.pathname = `/${name}`
    const pool = new Pool({ connectionString: url.toString(), max: 1 })
    pools.push(pool)
    return { url: url.toString(), pool }
  }

  try {
    const base = await fixture('base')
    migrateWith(base.url, baseFolders)
    const baseSchema = await describeSchema(base.pool)
    const baseLedger = await ledgerNames(base.pool)

    const subject = await fixture('subject')
    migrate(subject.url)
    const upSchema = await describeSchema(subject.pool)
    const upLedger = await ledgerNames(subject.pool)
    assertEqual('Applied migrations', upLedger, folders)

    for (const folder of reverted) {
      await subject.pool.query(readFileSync(path.join(migrationsDirectory, folder, 'down.sql'), 'utf8'))
    }
    assertEqual('Schema after every down.sql', await describeSchema(subject.pool), baseSchema)
    assertEqual('Ledger after every down.sql', await ledgerNames(subject.pool), baseLedger)

    migrate(subject.url)
    assertEqual('Schema after migrating again', await describeSchema(subject.pool), upSchema)
    assertEqual('Ledger after migrating again', await ledgerNames(subject.pool), upLedger)
    return { reverted }
  } finally {
    await Promise.all(pools.map((pool) => pool.end()))
    for (const name of created) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.end()
  }
}