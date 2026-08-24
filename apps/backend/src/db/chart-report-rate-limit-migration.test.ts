import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_NAME = 'dxrating_chart_report_rate_limit_migration_test'
const MIGRATION_TAG = '0025_add_chart_report_rate_limits'
const PRIOR_MIGRATION_TAG = '0024_protect_chart_reports'

const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Chart-report rate-limit migration tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })

const applyStatements = async (client: PoolClient, statements: readonly string[]): Promise<void> => {
  await client.query('BEGIN')
  try {
    for (const statement of statements) await client.query(statement)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

describe('chart-report rate-limit migration', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })
  let migrationIndex = -1
  let userRelationFileNode: string

  beforeAll(async () => {
    const journal = JSON.parse(await readFile(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as {
      readonly entries: readonly { readonly tag: string }[]
    }
    migrationIndex = journal.entries.findIndex((entry) => entry.tag === MIGRATION_TAG)
    expect(migrationIndex).toBeGreaterThan(0)
    expect(journal.entries[migrationIndex - 1]?.tag).toBe(PRIOR_MIGRATION_TAG)

    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)

    const client = await migrationPool.connect()
    try {
      for (const migration of migrations.slice(0, migrationIndex)) await applyStatements(client, migration.sql)
      await client.query(
        `INSERT INTO "user" (id, name, email, role)
         VALUES ('existing-user', 'Existing User', 'existing@example.test', 'user')`,
      )
      const before = await client.query<{ readonly file_node: string }>(
        `SELECT pg_relation_filenode('"user"'::regclass)::text AS file_node`,
      )
      userRelationFileNode = before.rows[0]!.file_node
      await applyStatements(client, migrations[migrationIndex]!.sql)
    } finally {
      client.release()
    }
  })

  afterAll(async () => {
    await migrationPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.end()
  })

  it('is an adjacent generated expansion that does not rewrite populated tables', async () => {
    const migration = migrations[migrationIndex]!
    const migrationSql = migration.sql.join('\n')
    expect(migrationSql.match(/CREATE TABLE/g)).toHaveLength(2)
    expect(migrationSql).toContain('CREATE TABLE "chart_report_global_rate_limits"')
    expect(migrationSql).toContain('CREATE TABLE "chart_report_user_rate_limits"')
    expect(migrationSql).toContain('CREATE INDEX "chart_report_user_rate_limits_expiry_idx"')
    expect(migrationSql).not.toMatch(/(?:^|\n)\s*(?:DROP|TRUNCATE|UPDATE|DELETE)\b/i)
    expect(migrationSql).not.toContain('CREATE INDEX CONCURRENTLY')
    expect(migrationSql).not.toMatch(/\$\d+/)

    const alteredTables = [...migrationSql.matchAll(/ALTER TABLE "([^"]+)"/g)].map((match) => match[1])
    expect(new Set(alteredTables)).toEqual(new Set(['chart_report_user_rate_limits']))

    const after = await migrationPool.query<{ readonly file_node: string }>(
      `SELECT pg_relation_filenode('"user"'::regclass)::text AS file_node`,
    )
    expect(after.rows[0]?.file_node).toBe(userRelationFileNode)
    const oldRows = await migrationPool.query<{ readonly id: string }>(
      `SELECT id FROM "user" WHERE id = 'existing-user'`,
    )
    expect(oldRows.rows).toEqual([{ id: 'existing-user' }])

    const journal = JSON.parse(await readFile(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as {
      readonly entries: readonly { readonly idx: number; readonly tag: string }[]
    }
    expect(journal.entries.at(-2)).toMatchObject({ idx: migrationIndex - 1, tag: PRIOR_MIGRATION_TAG })
    expect(journal.entries.at(-1)).toMatchObject({ idx: migrationIndex, tag: MIGRATION_TAG })

    const previousSnapshot = JSON.parse(
      await readFile(path.join(migrationsFolder, 'meta/0024_snapshot.json'), 'utf8'),
    ) as { readonly id: string }
    const snapshot = JSON.parse(await readFile(path.join(migrationsFolder, 'meta/0025_snapshot.json'), 'utf8')) as {
      readonly prevId: string
      readonly tables: Readonly<Record<string, unknown>>
    }
    expect(snapshot.prevId).toBe(previousSnapshot.id)
    expect(snapshot.tables).toHaveProperty('public.chart_report_global_rate_limits')
    expect(snapshot.tables).toHaveProperty('public.chart_report_user_rate_limits')
  })

  it('creates only bounded non-PII bucket shapes, checks, and the cascade identity reference', async () => {
    const columns = await migrationPool.query<{
      readonly table_name: string
      readonly column_name: string
      readonly data_type: string
      readonly is_nullable: string
    }>(
      `
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('chart_report_global_rate_limits', 'chart_report_user_rate_limits')
        ORDER BY table_name, ordinal_position
      `,
    )
    expect(columns.rows).toEqual([
      ...[
        ['singleton_key', 'smallint'],
        ['window_started_at', 'timestamp with time zone'],
        ['attempt_count', 'bigint'],
        ['expires_at', 'timestamp with time zone'],
      ].map(([column_name, data_type]) => ({
        table_name: 'chart_report_global_rate_limits',
        column_name,
        data_type,
        is_nullable: 'NO',
      })),
      ...[
        ['user_id', 'text'],
        ['window_started_at', 'timestamp with time zone'],
        ['attempt_count', 'bigint'],
        ['expires_at', 'timestamp with time zone'],
      ].map(([column_name, data_type]) => ({
        table_name: 'chart_report_user_rate_limits',
        column_name,
        data_type,
        is_nullable: 'NO',
      })),
    ])
    expect(columns.rows.map((column) => column.column_name).join(' ')).not.toMatch(
      /ip|address|email|agent|token|report|url|body|digest/i,
    )

    const constraints = await migrationPool.query<{
      readonly table_name: string
      readonly constraint_name: string
      readonly definition: string
    }>(
      `
        SELECT
          relation.relname AS table_name,
          definition.conname AS constraint_name,
          pg_get_constraintdef(definition.oid) AS definition
        FROM pg_constraint AS definition
        JOIN pg_class AS relation ON relation.oid = definition.conrelid
        WHERE relation.relname IN ('chart_report_global_rate_limits', 'chart_report_user_rate_limits')
        ORDER BY relation.relname, definition.conname
      `,
    )
    const constraintDefinitions = new Map(
      constraints.rows.map((constraint) => [constraint.constraint_name, constraint.definition]),
    )
    expect(constraintDefinitions.get('chart_report_global_rate_limits_singleton_check')).toContain('singleton_key = 1')
    expect(constraintDefinitions.get('chart_report_global_rate_limits_count_check')).toContain('attempt_count >= 1')
    expect(constraintDefinitions.get('chart_report_global_rate_limits_window_check')).toContain(
      'expires_at > window_started_at',
    )
    expect(constraintDefinitions.get('chart_report_user_rate_limits_count_check')).toContain('attempt_count >= 1')
    expect(constraintDefinitions.get('chart_report_user_rate_limits_window_check')).toContain(
      'expires_at > window_started_at',
    )
    expect(constraintDefinitions.get('chart_report_user_rate_limits_user_id_user_id_fk')).toContain('ON DELETE CASCADE')

    const index = await migrationPool.query<{
      readonly indexdef: string
      readonly indisready: boolean
      readonly indisvalid: boolean
    }>(
      `
        SELECT pg_get_indexdef(indexes.indexrelid) AS indexdef, indexes.indisready, indexes.indisvalid
        FROM pg_index AS indexes
        JOIN pg_class AS index_relation ON index_relation.oid = indexes.indexrelid
        WHERE index_relation.relname = 'chart_report_user_rate_limits_expiry_idx'
      `,
    )
    expect(index.rows).toEqual([
      {
        indexdef:
          'CREATE INDEX chart_report_user_rate_limits_expiry_idx ON public.chart_report_user_rate_limits USING btree (expires_at, user_id)',
        indisready: true,
        indisvalid: true,
      },
    ])
  })

  it('enforces singleton/count/window bounds while allowing mixed-version user writes', async () => {
    await migrationPool.query(
      `INSERT INTO "user" (id, name, email, role)
       VALUES ('post-expansion-user', 'Post Expansion', 'post-expansion@example.test', 'user')`,
    )
    await expect(
      migrationPool.query(
        `INSERT INTO chart_report_global_rate_limits
           (singleton_key, window_started_at, attempt_count, expires_at)
         VALUES (2, transaction_timestamp(), 1, transaction_timestamp() + interval '1 minute')`,
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_report_global_rate_limits_singleton_check' })
    await expect(
      migrationPool.query(
        `INSERT INTO chart_report_global_rate_limits
           (singleton_key, window_started_at, attempt_count, expires_at)
         VALUES (1, transaction_timestamp(), 0, transaction_timestamp() + interval '1 minute')`,
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_report_global_rate_limits_count_check' })
    await expect(
      migrationPool.query(
        `INSERT INTO chart_report_user_rate_limits
           (user_id, window_started_at, attempt_count, expires_at)
         VALUES ('post-expansion-user', transaction_timestamp(), 1, transaction_timestamp())`,
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chart_report_user_rate_limits_window_check' })

    await migrationPool.query(
      `INSERT INTO chart_report_user_rate_limits
         (user_id, window_started_at, attempt_count, expires_at)
       VALUES (
         'post-expansion-user',
         transaction_timestamp(),
         1,
         transaction_timestamp() + interval '10 minutes'
       )`,
    )
    await migrationPool.query(`DELETE FROM "user" WHERE id = 'post-expansion-user'`)
    const cascade = await migrationPool.query<{ readonly count: number }>(
      `SELECT count(*)::integer AS count
       FROM chart_report_user_rate_limits
       WHERE user_id = 'post-expansion-user'`,
    )
    expect(cascade.rows).toEqual([{ count: 0 }])
  })
})