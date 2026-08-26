import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runAdminCommentCreatedAtBackfill } from './admin-comment-created-at-backfill.js'
import { runNonTransactionalMigrations } from './non-transactional-migrations.js'

const DATABASE_NAME = 'dxrating_admin_comment_feed_migration_test'
const GENERATED_MIGRATION_TAG = '0022_admin_comment_feed_indexes'
const INDEX_NAMES = [
  'admin_comment_moderation_state_deleted_comment_recent_idx',
  'admin_comments_author_recent_idx',
  'admin_comments_chart_recent_idx',
  'admin_comments_parent_created_idx',
  'admin_comments_recent_idx',
] as const

const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Administrator comment-feed migration tests require the configured dxrating_test database')
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

const seedPreExpansionModerationRows = async (client: PoolClient) => {
  await client.query(`
    INSERT INTO "user" (
      id, name, email, email_verified, role,
      admin_authorization_not_before, created_at, updated_at
    ) VALUES
      ('legacy-actor', 'Legacy Actor', 'legacy-actor@example.test', true, 'admin', now(), now(), now()),
      ('legacy-author', 'Legacy Author', 'legacy-author@example.test', true, 'user', now(), now(), now())
  `)
  await client.query(`
    INSERT INTO comments (
      id, created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content
    ) VALUES
      (1, timestamp '2026-08-24 10:00:00.123451', 'legacy-author', 'legacy-song', 'dx', 'master', NULL, 'one'),
      (2, timestamp '2026-08-24 10:00:00.123452', 'legacy-author', 'legacy-song', 'dx', 'master', 1, 'two'),
      (3, timestamp '2026-08-24 10:00:00.123453', 'legacy-author', 'legacy-song', 'dx', 'master', 1, 'three')
  `)
  await client.query(`
    INSERT INTO admin_comment_moderation_history (
      comment_id, actor_user_id, previous_event_id, action, reason, request_correlation_id
    )
    SELECT id, 'legacy-actor', NULL, 'delete', 'Legacy delete',
           '11111111-1111-4111-8111-111111111111'::uuid
    FROM comments
    WHERE id BETWEEN 1 AND 3
    ORDER BY id
  `)
  await client.query(`
    INSERT INTO admin_comment_moderation_state (
      comment_id, established_action, deletion_reason, actor_user_id,
      established_by_event_id, moderated_at
    )
    SELECT comment_id, action, reason, actor_user_id, id, created_at
    FROM admin_comment_moderation_history
    WHERE comment_id BETWEEN 1 AND 3
    ORDER BY comment_id
  `)
  await client.query(`SELECT setval(pg_get_serial_sequence('comments', 'id'), 3, true)`)
}

type ExplainNode = {
  readonly 'Node Type': string
  readonly 'Index Name'?: string
  readonly 'Actual Rows'?: number
  readonly Plans?: readonly ExplainNode[]
}

const flattenPlan = (node: ExplainNode): ExplainNode[] => [node, ...(node.Plans?.flatMap(flattenPlan) ?? [])]

describe('administrator comment-feed expansion, backfill, and indexes', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })
  let generatedMigrationIndex = -1

  beforeAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)
    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    generatedMigrationIndex = journal.default.entries.findIndex((entry) => entry.tag === GENERATED_MIGRATION_TAG)
    expect(generatedMigrationIndex).toBeGreaterThan(0)

    const client = await migrationPool.connect()
    try {
      for (const [index, migration] of migrations.entries()) {
        if (index === generatedMigrationIndex) await seedPreExpansionModerationRows(client)
        await applyGeneratedMigration(client, migration.sql)
      }
      await runNonTransactionalMigrations({
        client,
        migrationsFolder: nonTransactionalMigrationsFolder,
        logger: { info: () => undefined, error: () => undefined },
      })
    } finally {
      client.release()
    }
  }, 120_000)

  afterAll(async () => {
    await migrationPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.end()
  })

  it('keeps index builds out of the generated transaction and leaves the derived projection nullable', async () => {
    const source = await readFile(`${migrationsFolder}/${GENERATED_MIGRATION_TAG}.sql`, 'utf8')
    expect(source).toContain('ADD COLUMN "comment_created_at" timestamp')
    expect(source).toContain('CREATE OR REPLACE FUNCTION "public"."guard_admin_comment_moderation_state"')
    const executableSql = source.replace(/--[^\r\n]*/g, '')
    expect(executableSql).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX/i)
    expect(executableSql).not.toMatch(/\bCONCURRENTLY\b/i)

    const column = await migrationPool.query<{ readonly is_nullable: string; readonly data_type: string }>(
      `SELECT is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'admin_comment_moderation_state'
         AND column_name = 'comment_created_at'`,
    )
    expect(column.rows).toEqual([{ is_nullable: 'YES', data_type: 'timestamp without time zone' }])
  })

  it('installs exact valid and ready reviewed indexes, including order flags and partial predicates', async () => {
    const indexes = await migrationPool.query<{
      readonly index_name: string
      readonly valid: boolean
      readonly ready: boolean
      readonly definition: string
    }>(
      `SELECT index_relation.relname AS index_name,
              index.indisvalid AS valid,
              index.indisready AS ready,
              pg_get_indexdef(index.indexrelid) AS definition
       FROM pg_index index
       JOIN pg_class index_relation ON index_relation.oid = index.indexrelid
       JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND index_relation.relname = ANY($1::text[])
       ORDER BY index_relation.relname`,
      [[...INDEX_NAMES]],
    )
    expect(indexes.rows.map((entry) => entry.index_name)).toEqual([...INDEX_NAMES].sort())
    expect(indexes.rows.every((entry) => entry.valid && entry.ready)).toBe(true)
    const definitions = new Map(indexes.rows.map((entry) => [entry.index_name, entry.definition]))
    expect(definitions.get('admin_comments_recent_idx')).toContain('(created_at DESC NULLS LAST, id DESC NULLS LAST)')
    expect(definitions.get('admin_comments_author_recent_idx')).toContain(
      '(created_by, created_at DESC NULLS LAST, id DESC NULLS LAST)',
    )
    expect(definitions.get('admin_comments_chart_recent_idx')).toContain(
      '(song_id, sheet_type, sheet_difficulty, created_at DESC NULLS LAST, id DESC NULLS LAST)',
    )
    expect(definitions.get('admin_comments_parent_created_idx')).toContain(
      '(parent_id, created_at, id) WHERE (parent_id IS NOT NULL)',
    )
    expect(definitions.get('admin_comment_moderation_state_deleted_comment_recent_idx')).toContain(
      "(comment_created_at DESC NULLS LAST, comment_id DESC NULLS LAST) WHERE ((established_action = 'delete'::text) AND (comment_created_at IS NOT NULL))",
    )
  })

  it('rejects a same-name recent index with incompatible null ordering', async () => {
    const expectedIndex = 'admin_comments_recent_idx_expected_definition'
    await migrationPool.query(`ALTER INDEX public.admin_comments_recent_idx RENAME TO ${expectedIndex}`)
    try {
      await migrationPool.query(`CREATE INDEX admin_comments_recent_idx ON public.comments (created_at DESC, id DESC)`)
      const verification = await readFile(
        `${nonTransactionalMigrationsFolder}/0024_admin_comments_recent.verify.sql`,
        'utf8',
      )
      const result = await migrationPool.query<{ readonly verified: boolean }>(verification)
      expect(result.rows).toEqual([{ verified: false }])
    } finally {
      await migrationPool.query('DROP INDEX IF EXISTS public.admin_comments_recent_idx')
      await migrationPool.query(`ALTER INDEX public.${expectedIndex} RENAME TO admin_comments_recent_idx`)
    }
  })

  it('derives new values, permits only exact legacy projection backfill, and resumes at a fixed high-water mark', async () => {
    const legacyBefore = await migrationPool.query<{ readonly comment_id: string }>(
      `SELECT comment_id::text
       FROM admin_comment_moderation_state
       WHERE comment_created_at IS NULL
       ORDER BY comment_id`,
    )
    expect(legacyBefore.rows.map((row) => row.comment_id)).toEqual(['1', '2', '3'])

    await expect(
      migrationPool.query(
        `UPDATE admin_comment_moderation_state
         SET comment_created_at = timestamp '1999-01-01 00:00:00'
         WHERE comment_id = 1`,
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'admin_comment_moderation_state_comment_created_at_guard',
    })

    const paused = await runAdminCommentCreatedAtBackfill({
      pool: migrationPool,
      batchSize: 1,
      maxBatches: 1,
      logger: { info: () => undefined },
    })
    expect(paused).toMatchObject({ status: 'paused', highWaterMark: '3', cursor: '1', processedCount: 1n })

    const newComment = await migrationPool.query<{ readonly id: string; readonly created_at: Date }>(
      `INSERT INTO comments (
         created_at, created_by, song_id, sheet_type, sheet_difficulty, content
       ) VALUES (
         timestamp '2026-08-24 11:00:00.654321',
         'legacy-author', 'new-song', 'dx', 'expert', 'new comment'
       )
       RETURNING id::text, created_at`,
    )
    const newCommentId = newComment.rows[0]!.id
    const deleteEvent = await migrationPool.query<{ readonly id: string; readonly created_at: Date }>(
      `INSERT INTO admin_comment_moderation_history (
         comment_id, actor_user_id, previous_event_id, action, reason, request_correlation_id
       ) VALUES (
         $1::bigint, 'legacy-actor', NULL, 'delete', 'New delete',
         '22222222-2222-4222-8222-222222222222'::uuid
       )
       RETURNING id::text, created_at`,
      [newCommentId],
    )
    await migrationPool.query(
      `INSERT INTO admin_comment_moderation_state (
         comment_id, established_action, deletion_reason, actor_user_id,
         established_by_event_id, moderated_at
       ) VALUES ($1::bigint, 'delete', 'New delete', 'legacy-actor', $2::bigint, $3)`,
      [newCommentId, deleteEvent.rows[0]!.id, deleteEvent.rows[0]!.created_at],
    )
    const derived = await migrationPool.query<{ readonly matches: boolean }>(
      `SELECT state.comment_created_at = comment.created_at AS matches
       FROM admin_comment_moderation_state state
       JOIN comments comment ON comment.id = state.comment_id
       WHERE state.comment_id = $1::bigint`,
      [newCommentId],
    )
    expect(derived.rows).toEqual([{ matches: true }])

    const restoreEvent = await migrationPool.query<{ readonly id: string; readonly created_at: Date }>(
      `INSERT INTO admin_comment_moderation_history (
         comment_id, actor_user_id, previous_event_id, action, reason, request_correlation_id
       ) VALUES (
         $1::bigint, 'legacy-actor', $2::bigint, 'restore', NULL,
         '33333333-3333-4333-8333-333333333333'::uuid
       )
       RETURNING id::text, created_at`,
      [newCommentId, deleteEvent.rows[0]!.id],
    )
    await migrationPool.query(
      `UPDATE admin_comment_moderation_state
       SET established_action = 'restore',
           deletion_reason = NULL,
           actor_user_id = 'legacy-actor',
           established_by_event_id = $2::bigint,
           moderated_at = $3
       WHERE comment_id = $1::bigint`,
      [newCommentId, restoreEvent.rows[0]!.id, restoreEvent.rows[0]!.created_at],
    )
    await expect(
      migrationPool.query(
        `UPDATE admin_comment_moderation_state
         SET comment_created_at = comment_created_at + interval '1 second'
         WHERE comment_id = $1::bigint`,
        [newCommentId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'admin_comment_moderation_state_comment_created_at_guard',
    })

    const completed = await runAdminCommentCreatedAtBackfill({
      pool: migrationPool,
      batchSize: 1,
      logger: { info: () => undefined },
    })
    expect(completed).toMatchObject({ status: 'completed', highWaterMark: '3', cursor: '3', processedCount: 3n })
    const unresolved = await migrationPool.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
       FROM admin_comment_moderation_state
       WHERE comment_created_at IS NULL`,
    )
    expect(unresolved.rows).toEqual([{ count: '0' }])
  })

  it('uses bounded index-ordered plans at representative volume without avoidable sorts', async () => {
    await migrationPool.query(`
      INSERT INTO "user" (
        id, name, email, email_verified, role,
        admin_authorization_not_before, created_at, updated_at
      )
      SELECT 'feed-author-' || value,
             'Feed Author ' || value,
             'feed-author-' || value || '@example.test',
             true,
             'user',
             now(), now(), now()
      FROM generate_series(0, 9) value
    `)
    await migrationPool.query(`
      INSERT INTO comments (
        created_at, created_by, song_id, sheet_type, sheet_difficulty, content
      )
      SELECT timestamp '2026-01-01 00:00:00'
               + value * interval '1 microsecond',
             'feed-author-' || (value % 10),
             'feed-song-' || (value % 5),
             CASE WHEN value % 2 = 0 THEN 'dx' ELSE 'standard' END,
             CASE WHEN value % 3 = 0 THEN 'master' ELSE 'expert' END,
             'representative comment ' || value
      FROM generate_series(1, 20000) value
    `)
    const root = await migrationPool.query<{ readonly id: string }>(
      `SELECT id::text
       FROM comments
       WHERE created_by = 'feed-author-1'
       ORDER BY id
       LIMIT 1`,
    )
    await migrationPool.query(
      `INSERT INTO comments (
         created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content
       )
       SELECT timestamp '2026-02-01 00:00:00' + value * interval '1 microsecond',
              'feed-author-' || (value % 10),
              'thread-song', 'dx', 'master', $1::bigint,
              'representative reply ' || value
       FROM generate_series(1, 500) value`,
      [root.rows[0]!.id],
    )
    await migrationPool.query(`
      INSERT INTO admin_comment_moderation_history (
        comment_id, actor_user_id, previous_event_id, action, reason, request_correlation_id
      )
      SELECT id, 'legacy-actor', NULL, 'delete', 'Representative delete',
             '44444444-4444-4444-8444-444444444444'::uuid
      FROM comments
      WHERE id > 4
        AND id % 5 = 0
      ORDER BY id
    `)
    await migrationPool.query(`
      INSERT INTO admin_comment_moderation_state (
        comment_id, established_action, deletion_reason, actor_user_id,
        established_by_event_id, moderated_at
      )
      SELECT history.comment_id, history.action, history.reason,
             history.actor_user_id, history.id, history.created_at
      FROM admin_comment_moderation_history history
      LEFT JOIN admin_comment_moderation_state state ON state.comment_id = history.comment_id
      WHERE history.comment_id > 4
        AND state.comment_id IS NULL
      ORDER BY history.comment_id
    `)
    await migrationPool.query('ANALYZE comments')
    await migrationPool.query('ANALYZE admin_comment_moderation_state')

    const explain = async (query: string, parameters: readonly unknown[] = []) => {
      const result = await migrationPool.query<{ readonly 'QUERY PLAN': readonly [{ readonly Plan: ExplainNode }] }>(
        `EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF, FORMAT JSON) ${query}`,
        [...parameters],
      )
      return flattenPlan(result.rows[0]!['QUERY PLAN'][0].Plan)
    }
    const expectStreamingIndex = (
      nodes: readonly ExplainNode[],
      indexName: string,
      { allowBoundedSort = false }: { readonly allowBoundedSort?: boolean } = {},
    ) => {
      expect(nodes.some((node) => node['Index Name'] === indexName)).toBe(true)
      expect(nodes.some((node) => node['Node Type'] === 'Seq Scan')).toBe(false)
      const sorts = nodes.filter((node) => node['Node Type'] === 'Sort')
      if (allowBoundedSort) {
        expect(sorts.every((node) => (node['Actual Rows'] ?? Number.POSITIVE_INFINITY) <= 501)).toBe(true)
      } else {
        expect(sorts).toHaveLength(0)
      }
    }

    expectStreamingIndex(
      await explain(
        `SELECT id
         FROM comments
         WHERE (created_at, id) < (timestamp '2027-01-01', 9223372036854775807::bigint)
         ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 26`,
      ),
      'admin_comments_recent_idx',
    )
    expectStreamingIndex(
      await explain(
        `SELECT id
         FROM comments
         WHERE created_by = 'feed-author-7'
           AND (created_at, id) < (timestamp '2027-01-01', 9223372036854775807::bigint)
         ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 26`,
      ),
      'admin_comments_author_recent_idx',
    )
    expectStreamingIndex(
      await explain(
        `SELECT id
         FROM comments
         WHERE song_id = 'feed-song-2'
           AND sheet_type = 'dx'
           AND sheet_difficulty = 'expert'
           AND (created_at, id) < (timestamp '2027-01-01', 9223372036854775807::bigint)
         ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
         LIMIT 26`,
      ),
      'admin_comments_chart_recent_idx',
    )
    expectStreamingIndex(
      await explain(
        `SELECT id
         FROM comments
         WHERE parent_id = $1::bigint
         ORDER BY created_at, id
         LIMIT 501`,
        [root.rows[0]!.id],
      ),
      'admin_comments_parent_created_idx',
      { allowBoundedSort: true },
    )
    expectStreamingIndex(
      await explain(
        `SELECT comment_id
         FROM admin_comment_moderation_state
         WHERE established_action = 'delete'
           AND comment_created_at IS NOT NULL
           AND (comment_created_at, comment_id)
             < (timestamp '2027-01-01', 9223372036854775807::bigint)
         ORDER BY comment_created_at DESC NULLS LAST, comment_id DESC NULLS LAST
         LIMIT 26`,
      ),
      'admin_comment_moderation_state_deleted_comment_recent_idx',
    )

    await migrationPool.query('SET enable_seqscan = off')
    await migrationPool.query('SET enable_bitmapscan = off')
    try {
      expectStreamingIndex(
        await explain(
          `SELECT id
           FROM admin_comment_moderation_history
           WHERE comment_id = 1
           ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
           LIMIT 26`,
        ),
        'admin_comment_moderation_history_comment_created_idx',
      )
      expectStreamingIndex(
        await explain(
          `SELECT id
           FROM admin_user_ban_history
           WHERE subject_user_id = 'legacy-author'
           ORDER BY created_at DESC NULLS LAST, id DESC NULLS LAST
           LIMIT 26`,
        ),
        'admin_user_ban_history_subject_created_idx',
      )
    } finally {
      await migrationPool.query('RESET enable_seqscan')
      await migrationPool.query('RESET enable_bitmapscan')
    }
  }, 120_000)
})