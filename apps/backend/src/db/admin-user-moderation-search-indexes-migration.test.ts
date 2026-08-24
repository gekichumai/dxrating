import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runNonTransactionalMigrations } from './non-transactional-migrations.js'

const DATABASE_NAME = 'dxrating_admin_user_moderation_search_index_test'
const GENERATED_MIGRATION_TAG = '0019_admin_user_moderation_search'
const INDEX_NAMES = [
  'admin_profile_search_display_name_lower_pattern_id_idx',
  'admin_user_ban_state_active_subject_idx',
  'admin_user_search_email_lower_id_idx',
  'admin_user_search_name_lower_pattern_id_idx',
  'admin_user_search_role_id_idx',
] as const

const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Administrator user-search index tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const nonTransactionalMigrationsFolder = fileURLToPath(new URL('../../non-transactional-migrations', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })

const applyGeneratedMigration = async (client: PoolClient, statements: readonly string[]) => {
  await client.query('BEGIN')
  try {
    for (const statement of statements) await client.query(statement)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

describe('administrator user moderation search indexes', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })

  beforeAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)
    const client = await migrationPool.connect()
    try {
      for (const migration of migrations) await applyGeneratedMigration(client, migration.sql)
      await runNonTransactionalMigrations({
        client,
        migrationsFolder: nonTransactionalMigrationsFolder,
        logger: { info: () => undefined, error: () => undefined },
      })
    } finally {
      client.release()
    }
  })

  afterAll(async () => {
    await migrationPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.end()
  })

  it('keeps index DDL out of the transactional generated journal', async () => {
    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    const index = journal.default.entries.findIndex((entry) => entry.tag === GENERATED_MIGRATION_TAG)
    expect(index).toBeGreaterThan(0)
    expect(migrations[index]).toBeDefined()
    const source = await readFile(`${migrationsFolder}/${GENERATED_MIGRATION_TAG}.sql`, 'utf8')
    expect(source).toContain('Metadata-only generated migration')
    const executableSql = source.replace(/--[^\r\n]*/g, '')
    expect(executableSql).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX/i)
    expect(executableSql).not.toMatch(/\bCONCURRENTLY\b/i)
  })

  it('installs valid ready indexes with exact keys, pattern operator classes, predicate, and covering columns', async () => {
    const indexes = await migrationPool.query<{
      readonly index_name: string
      readonly valid: boolean
      readonly ready: boolean
      readonly key_count: number
      readonly attribute_count: number
      readonly definition: string
      readonly predicate: string | null
    }>(
      `SELECT
         index_relation.relname AS index_name,
         index.indisvalid AS valid,
         index.indisready AS ready,
         index.indnkeyatts AS key_count,
         index.indnatts AS attribute_count,
         pg_get_indexdef(index.indexrelid) AS definition,
         pg_get_expr(index.indpred, index.indrelid, true) AS predicate
       FROM pg_index index
       JOIN pg_class index_relation ON index_relation.oid = index.indexrelid
       JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND index_relation.relname = ANY($1::text[])
       ORDER BY index_relation.relname`,
      [[...INDEX_NAMES]],
    )
    expect(indexes.rows.map(({ index_name }) => index_name)).toEqual([...INDEX_NAMES].sort())
    expect(indexes.rows.every(({ valid, ready }) => valid && ready)).toBe(true)

    const byName = new Map(indexes.rows.map((entry) => [entry.index_name, entry]))
    expect(byName.get('admin_profile_search_display_name_lower_pattern_id_idx')).toMatchObject({
      key_count: 2,
      attribute_count: 2,
      predicate: null,
    })
    expect(byName.get('admin_profile_search_display_name_lower_pattern_id_idx')?.definition).toContain(
      "lower(btrim(regexp_replace(NORMALIZE(display_name, NFKC), '[[:space:]]+'::text, ' '::text, 'g'::text))) text_pattern_ops, id",
    )
    expect(byName.get('admin_user_search_name_lower_pattern_id_idx')?.definition).toContain(
      "lower(btrim(regexp_replace(NORMALIZE(name, NFKC), '[[:space:]]+'::text, ' '::text, 'g'::text))) text_pattern_ops, id",
    )
    expect(byName.get('admin_user_search_email_lower_id_idx')?.definition).toContain(
      'lower(btrim(NORMALIZE(email, NFKC))), id',
    )
    expect(byName.get('admin_user_search_role_id_idx')?.definition).toContain('(role, id)')
    expect(byName.get('admin_user_ban_state_active_subject_idx')).toMatchObject({
      key_count: 1,
      attribute_count: 3,
      predicate: "established_action = 'ban'::text",
    })
    expect(byName.get('admin_user_ban_state_active_subject_idx')?.definition).toContain(
      'INCLUDE (ban_expires_at, established_by_event_id)',
    )
  })

  it('provides the intended access paths for every bounded search mode', async () => {
    await migrationPool.query('SET enable_seqscan = off')
    const explain = async (query: string) =>
      (await migrationPool.query<{ readonly 'QUERY PLAN': string }>(`EXPLAIN (COSTS OFF) ${query}`)).rows
        .map((row) => row['QUERY PLAN'])
        .join('\n')

    expect(await explain(`SELECT id FROM "user" WHERE role = 'admin' ORDER BY id LIMIT 26`)).toContain(
      'admin_user_search_role_id_idx',
    )
    expect(await explain(`SELECT id FROM "user" WHERE id = 'exact-user-id'`)).toContain('user_pkey')
    expect(
      await explain(`SELECT id FROM "user" WHERE lower(btrim(normalize(email, NFKC))) = 'admin@example.test'`),
    ).toContain('admin_user_search_email_lower_id_idx')
    expect(
      await explain(
        `SELECT id FROM "user"
         WHERE lower(btrim(regexp_replace(normalize(name, NFKC), '[[:space:]]+', ' ', 'g')))
           LIKE 'visible%' ESCAPE '\\'`,
      ),
    ).toContain('admin_user_search_name_lower_pattern_id_idx')
    expect(
      await explain(
        `SELECT id FROM profiles
         WHERE lower(btrim(regexp_replace(normalize(display_name, NFKC), '[[:space:]]+', ' ', 'g')))
           LIKE 'visible%' ESCAPE '\\'`,
      ),
    ).toContain('admin_profile_search_display_name_lower_pattern_id_idx')
    expect(
      await explain(
        `SELECT subject_user_id FROM admin_user_ban_state WHERE established_action = 'ban' ORDER BY subject_user_id`,
      ),
    ).toContain('admin_user_ban_state_active_subject_idx')
  })

  it('rejects a same-name active-ban index with a weaker definition', async () => {
    const expectedIndex = 'admin_user_ban_state_active_subject_idx_expected_definition'
    await migrationPool.query(`ALTER INDEX public.admin_user_ban_state_active_subject_idx RENAME TO ${expectedIndex}`)
    try {
      await migrationPool.query(
        `CREATE INDEX admin_user_ban_state_active_subject_idx
           ON public.admin_user_ban_state USING btree (subject_user_id)
          WHERE established_action = 'ban'`,
      )
      const verification = await readFile(
        `${nonTransactionalMigrationsFolder}/0020_admin_user_active_ban_search.verify.sql`,
        'utf8',
      )
      const result = await migrationPool.query<{ readonly verified: boolean }>(verification)
      expect(result.rows).toEqual([{ verified: false }])
    } finally {
      await migrationPool.query('DROP INDEX IF EXISTS public.admin_user_ban_state_active_subject_idx')
      await migrationPool.query(`ALTER INDEX public.${expectedIndex} RENAME TO admin_user_ban_state_active_subject_idx`)
    }
  })
})