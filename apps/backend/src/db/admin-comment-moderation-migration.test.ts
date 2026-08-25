import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_NAME = 'dxrating_admin_comment_moderation_migration_test'
const RUNTIME_ROLE = 'dxrating_admin_comment_moderation_runtime_test'
const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Administrator comment-moderation migration tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })
const EXPANSION_MIGRATION_TAG = '0020_add_admin_comment_moderation'
const PROTECTION_MIGRATION_TAG = '0021_protect_admin_comment_moderation'

const applyStatements = async (client: PoolClient, statements: string[]) => {
  await client.query('BEGIN')
  try {
    for (const statement of statements) await client.query(statement)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

const insertUser = async (client: PoolClient, id: string, role: 'user' | 'admin' = 'user') => {
  await client.query(
    `INSERT INTO "user" (id, name, email, role)
     VALUES ($1, $2, $3, $4)`,
    [id, id, `${id}@example.test`, role],
  )
}

const insertComment = async (
  client: PoolClient,
  createdBy: string,
  content: string,
  parentId: string | null = null,
) => {
  const result = await client.query<{ readonly id: string }>(
    `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
     VALUES ($1, 'migration-song', 'dx', 'master', $2, $3)
     RETURNING id::text`,
    [createdBy, parentId, content],
  )
  return result.rows[0]!.id
}

type EventOverrides = Partial<{
  actorUserId: string
  previousEventId: string | null
  action: 'delete' | 'restore'
  reason: string | null
  requestCorrelationId: string | null
  createdAt: string
}>

const insertEvent = async (client: PoolClient, commentId: string, overrides: EventOverrides = {}) => {
  const values = {
    actorUserId: 'actor-user',
    previousEventId: null,
    action: 'delete' as const,
    reason: 'Removed after repeated harassment in the chart discussion',
    requestCorrelationId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
    createdAt: '2000-01-01T00:00:00Z',
    ...overrides,
  }

  return client.query<{
    readonly id: string
    readonly action: 'delete' | 'restore'
    readonly reason: string | null
    readonly created_at: Date
  }>(
    `INSERT INTO admin_comment_moderation_history
       (comment_id, actor_user_id, previous_event_id, action, reason, request_correlation_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text, action, reason, created_at`,
    [
      commentId,
      values.actorUserId,
      values.previousEventId,
      values.action,
      values.reason,
      values.requestCorrelationId,
      values.createdAt,
    ],
  )
}

const projectEvent = async (client: PoolClient, eventId: string, update = false) =>
  client.query(
    update
      ? `UPDATE admin_comment_moderation_state AS state
           SET established_action = event.action,
               deletion_reason = CASE WHEN event.action = 'delete' THEN event.reason ELSE NULL END,
               actor_user_id = event.actor_user_id,
               established_by_event_id = event.id,
               moderated_at = event.created_at
          FROM admin_comment_moderation_history AS event
         WHERE state.comment_id = event.comment_id
           AND event.id = $1`
      : `INSERT INTO admin_comment_moderation_state
           (comment_id, established_action, deletion_reason, actor_user_id, established_by_event_id, moderated_at)
         SELECT comment_id,
                action,
                CASE WHEN action = 'delete' THEN reason ELSE NULL END,
                actor_user_id,
                id,
                created_at
           FROM admin_comment_moderation_history
          WHERE id = $1`,
    [eventId],
  )

describe('administrator comment-moderation migrations', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })

  beforeAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`)
    await adminPool.query(`CREATE ROLE ${RUNTIME_ROLE} NOLOGIN`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)
  })

  afterAll(async () => {
    await migrationPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`)
    await adminPool.end()
  })

  it('expands compatibly and protects immutable originals, linear history, and runtime privileges', async () => {
    expect(path.basename(migrationsFolder)).toBe('drizzle')
    const journal = await import('../../drizzle/meta/_journal.json', { with: { type: 'json' } })
    const expansionIndex = journal.default.entries.findIndex((entry) => entry.tag === EXPANSION_MIGRATION_TAG)
    const protectionIndex = journal.default.entries.findIndex((entry) => entry.tag === PROTECTION_MIGRATION_TAG)
    expect(expansionIndex).toBeGreaterThan(0)
    expect(protectionIndex).toBe(expansionIndex + 1)
    expect(journal.default.entries[expansionIndex]?.idx).toBe(expansionIndex)
    expect(journal.default.entries[protectionIndex]?.idx).toBe(protectionIndex)

    const expansion = migrations[expansionIndex]
    const protection = migrations[protectionIndex]
    expect(expansion).toBeDefined()
    expect(protection).toBeDefined()

    for (const statement of expansion!.sql) {
      expect(statement.trim()).toMatch(
        /^(?:CREATE TABLE "admin_comment_moderation_(?:history|state)"|ALTER TABLE "admin_comment_moderation_(?:history|state)"|CREATE (?:UNIQUE )?INDEX "admin_comment_moderation_)/,
      )
    }
    const expansionSql = expansion!.sql.join('\n')
    expect(expansionSql).not.toMatch(/(?:^|\n)\s*(?:DROP|TRUNCATE|DELETE FROM|UPDATE\s+\S+\s+SET)\b/im)
    expect(expansionSql).not.toContain('ALTER TABLE "comments"')
    expect(expansionSql).toContain('"request_correlation_id" uuid NOT NULL')
    expect(expansionSql).toContain('"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL')
    expect(expansionSql).toContain('ON DELETE restrict')

    const protectionSql = protection!.sql.join('\n')
    expect(protectionSql).toContain('BEFORE INSERT OR UPDATE OR DELETE')
    expect(protectionSql).toContain('NEW.created_at := clock_timestamp()::timestamptz(3)')
    expect(protectionSql).toContain('BEFORE UPDATE OR DELETE ON "public"."comments"')
    expect(protectionSql).toContain("CONSTRAINT = 'comments_immutable_guard'")
    expect(protectionSql).not.toContain('ALTER TABLE "public"."comments"')
    expect(protectionSql).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "public"."admin_comment_moderation_history" FROM PUBLIC',
    )
    expect(protectionSql).toContain(
      'REVOKE ALL PRIVILEGES ON SEQUENCE "public"."admin_comment_moderation_history_id_seq" FROM PUBLIC',
    )
    expect(protectionSql).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "public"."admin_comment_moderation_state" FROM PUBLIC',
    )

    const client = await migrationPool.connect()
    try {
      for (const previous of migrations.slice(0, expansionIndex)) await applyStatements(client, previous.sql)

      await insertUser(client, 'author-user')
      await insertUser(client, 'actor-user', 'admin')
      await insertUser(client, 'runtime-author')
      await insertUser(client, 'runtime-actor', 'admin')
      const parentId = await insertComment(client, 'author-user', 'Immutable original parent')
      const childId = await insertComment(client, 'author-user', 'Immutable original reply', parentId)

      await applyStatements(client, expansion!.sql)

      // The old backend can continue using the unchanged comment and identity
      // shape if rollout pauses after expansion. No existing row is rewritten.
      await client.query(`UPDATE "user" SET name = 'Updated during expansion' WHERE id = 'author-user'`)
      const secondChildId = await insertComment(client, 'author-user', 'Reply created by the prior backend', parentId)
      const mixedVersionShape = await client.query<{
        readonly content: string
        readonly parent_id: string | null
      }>(
        `SELECT content, parent_id::text
           FROM comments
          WHERE id IN ($1, $2, $3)
          ORDER BY id`,
        [parentId, childId, secondChildId],
      )
      expect(mixedVersionShape.rows).toEqual([
        { content: 'Immutable original parent', parent_id: null },
        { content: 'Immutable original reply', parent_id: parentId },
        { content: 'Reply created by the prior backend', parent_id: parentId },
      ])

      await applyStatements(client, protection!.sql)

      const historyColumns = await client.query<{
        readonly column_name: string
        readonly data_type: string
        readonly is_nullable: string
        readonly datetime_precision: number | null
      }>(
        `SELECT column_name, data_type, is_nullable, datetime_precision
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'admin_comment_moderation_history'
          ORDER BY ordinal_position`,
      )
      expect(
        historyColumns.rows.map(({ column_name, data_type, is_nullable }) => ({
          column_name,
          data_type,
          is_nullable,
        })),
      ).toEqual([
        { column_name: 'id', data_type: 'bigint', is_nullable: 'NO' },
        { column_name: 'comment_id', data_type: 'bigint', is_nullable: 'NO' },
        { column_name: 'actor_user_id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'previous_event_id', data_type: 'bigint', is_nullable: 'YES' },
        { column_name: 'action', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'reason', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'request_correlation_id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ])
      expect(historyColumns.rows.find(({ column_name }) => column_name === 'created_at')?.datetime_precision).toBe(3)

      const stateColumns = await client.query<{ readonly column_name: string; readonly is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'admin_comment_moderation_state'
          ORDER BY ordinal_position`,
      )
      expect(stateColumns.rows).toEqual([
        { column_name: 'comment_id', is_nullable: 'NO' },
        { column_name: 'established_action', is_nullable: 'NO' },
        { column_name: 'deletion_reason', is_nullable: 'YES' },
        { column_name: 'actor_user_id', is_nullable: 'NO' },
        { column_name: 'established_by_event_id', is_nullable: 'NO' },
        { column_name: 'moderated_at', is_nullable: 'NO' },
      ])

      const foreignKeys = await client.query<{
        readonly table_name: string
        readonly constraint_name: string
        readonly delete_action: string
      }>(
        `SELECT child.relname AS table_name,
                fk.conname AS constraint_name,
                CASE fk.confdeltype
                  WHEN 'r' THEN 'RESTRICT'
                  WHEN 'c' THEN 'CASCADE'
                  ELSE fk.confdeltype::text
                END AS delete_action
           FROM pg_constraint AS fk
           JOIN pg_class AS child ON child.oid = fk.conrelid
          WHERE fk.contype = 'f'
            AND child.relname IN ('admin_comment_moderation_history', 'admin_comment_moderation_state', 'comments')
          ORDER BY child.relname, fk.conname`,
      )
      expect(
        foreignKeys.rows
          .filter(({ table_name }) => table_name.startsWith('admin_comment_moderation_'))
          .every(({ delete_action }) => delete_action === 'RESTRICT'),
      ).toBe(true)
      expect(foreignKeys.rows).toContainEqual({
        table_name: 'comments',
        constraint_name: 'comments_created_by_user_id_fk',
        delete_action: 'CASCADE',
      })

      const indexes = await client.query<{ readonly indexname: string; readonly indexdef: string }>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename IN ('admin_comment_moderation_history', 'admin_comment_moderation_state')
          ORDER BY indexname`,
      )
      expect(indexes.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            indexname: 'admin_comment_moderation_history_comment_created_idx',
            indexdef: expect.stringContaining('(comment_id, created_at DESC NULLS LAST, id DESC NULLS LAST)'),
          }),
          expect.objectContaining({
            indexname: 'admin_comment_moderation_history_comment_root_unique',
            indexdef: expect.stringContaining('WHERE (previous_event_id IS NULL)'),
          }),
          expect.objectContaining({
            indexname: 'admin_comment_moderation_state_deleted_recent_idx',
            indexdef: expect.stringContaining("WHERE (established_action = 'delete'::text)"),
          }),
        ]),
      )

      const publicPrivileges = await client.query<{
        readonly table_name: string
        readonly public_privileges: string[] | null
      }>(
        `SELECT tables.table_name,
                array_agg(grants.privilege_type ORDER BY grants.privilege_type)
                  FILTER (WHERE grants.privilege_type IS NOT NULL) AS public_privileges
           FROM (VALUES
             ('admin_comment_moderation_history'),
             ('admin_comment_moderation_state')
           ) AS tables(table_name)
           LEFT JOIN information_schema.role_table_grants AS grants
             ON grants.table_schema = 'public'
            AND grants.table_name = tables.table_name
            AND grants.grantee = 'PUBLIC'
          GROUP BY tables.table_name
          ORDER BY tables.table_name`,
      )
      expect(publicPrivileges.rows).toEqual([
        { table_name: 'admin_comment_moderation_history', public_privileges: null },
        { table_name: 'admin_comment_moderation_state', public_privileges: null },
      ])

      const original = await client.query(
        `SELECT id::text, created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id::text, content
           FROM comments
          WHERE id = $1`,
        [parentId],
      )
      const beforeInsert = await client.query<{ readonly recorded_at: Date }>(`SELECT clock_timestamp() AS recorded_at`)
      const deletion = await insertEvent(client, parentId)
      const afterInsert = await client.query<{ readonly recorded_at: Date }>(`SELECT clock_timestamp() AS recorded_at`)
      expect(deletion.rows).toHaveLength(1)
      expect(deletion.rows[0]!.created_at.getTime()).toBeGreaterThanOrEqual(
        beforeInsert.rows[0]!.recorded_at.getTime() - 1,
      )
      expect(deletion.rows[0]!.created_at.getTime()).toBeLessThanOrEqual(afterInsert.rows[0]!.recorded_at.getTime() + 1)
      expect(deletion.rows[0]!.created_at.toISOString()).not.toBe('2000-01-01T00:00:00.000Z')
      await projectEvent(client, deletion.rows[0]!.id)

      const deletedState = await client.query(
        `SELECT established_action, deletion_reason, actor_user_id, established_by_event_id::text, moderated_at
           FROM admin_comment_moderation_state
          WHERE comment_id = $1`,
        [parentId],
      )
      expect(deletedState.rows).toEqual([
        {
          established_action: 'delete',
          deletion_reason: 'Removed after repeated harassment in the chart discussion',
          actor_user_id: 'actor-user',
          established_by_event_id: deletion.rows[0]!.id,
          moderated_at: deletion.rows[0]!.created_at,
        },
      ])

      await expect(
        client.query(
          `UPDATE comments
              SET created_at = '2000-01-01T00:00:00Z',
                  created_by = 'actor-user',
                  song_id = 'rewritten-song',
                  sheet_type = 'standard',
                  sheet_difficulty = 'basic',
                  parent_id = $2,
                  content = 'Rewritten body'
            WHERE id = $1`,
          [parentId, childId],
        ),
      ).rejects.toMatchObject({ code: '55000', constraint: 'comments_immutable_guard' })
      await expect(client.query(`DELETE FROM comments WHERE id = $1`, [parentId])).rejects.toMatchObject({
        code: '55000',
        constraint: 'comments_immutable_guard',
      })
      const retainedTree = await client.query(
        `SELECT id::text, parent_id::text, content
           FROM comments
          WHERE id IN ($1, $2, $3)
          ORDER BY id`,
        [parentId, childId, secondChildId],
      )
      expect(retainedTree.rows).toEqual([
        { id: parentId, parent_id: null, content: 'Immutable original parent' },
        { id: childId, parent_id: parentId, content: 'Immutable original reply' },
        { id: secondChildId, parent_id: parentId, content: 'Reply created by the prior backend' },
      ])
      const afterRejectedRewrite = await client.query(
        `SELECT id::text, created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id::text, content
           FROM comments
          WHERE id = $1`,
        [parentId],
      )
      expect(afterRejectedRewrite.rows).toEqual(original.rows)

      for (const reason of [null, '', '   ', ' leading', 'trailing ', 'x'.repeat(1001)]) {
        await expect(insertEvent(client, childId, { reason })).rejects.toMatchObject({ code: '23514' })
      }
      await expect(insertEvent(client, childId, { requestCorrelationId: null })).rejects.toMatchObject({
        code: '23502',
      })
      await expect(insertEvent(client, childId, { action: 'restore', reason: null })).rejects.toMatchObject({
        code: '23514',
        constraint: 'admin_comment_moderation_history_root_action_guard',
      })

      const childDeletion = await insertEvent(client, childId)
      await projectEvent(client, childDeletion.rows[0]!.id)
      await expect(
        insertEvent(client, childId, {
          previousEventId: childDeletion.rows[0]!.id,
          action: 'restore',
          reason: 'restore must not retain an internal reason',
        }),
      ).rejects.toMatchObject({ code: '23514', constraint: 'admin_comment_moderation_history_reason_check' })

      const restoration = await insertEvent(client, parentId, {
        previousEventId: deletion.rows[0]!.id,
        action: 'restore',
        reason: null,
      })
      await projectEvent(client, restoration.rows[0]!.id, true)
      const restoredState = await client.query(
        `SELECT established_action, deletion_reason, established_by_event_id::text
           FROM admin_comment_moderation_state
          WHERE comment_id = $1`,
        [parentId],
      )
      expect(restoredState.rows).toEqual([
        {
          established_action: 'restore',
          deletion_reason: null,
          established_by_event_id: restoration.rows[0]!.id,
        },
      ])

      await expect(
        insertEvent(client, parentId, {
          previousEventId: restoration.rows[0]!.id,
          action: 'restore',
          reason: null,
        }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'admin_comment_moderation_history_transition_guard',
      })
      await expect(
        insertEvent(client, parentId, {
          previousEventId: deletion.rows[0]!.id,
          action: 'restore',
          reason: null,
        }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'admin_comment_moderation_history_state_version_guard',
      })

      const secondDeletion = await insertEvent(client, parentId, {
        previousEventId: restoration.rows[0]!.id,
        reason: 'A later independent moderation decision',
      })
      await projectEvent(client, secondDeletion.rows[0]!.id, true)
      const retainedHistory = await client.query(
        `SELECT action, reason, previous_event_id::text
           FROM admin_comment_moderation_history
          WHERE comment_id = $1
          ORDER BY id`,
        [parentId],
      )
      expect(retainedHistory.rows).toEqual([
        {
          action: 'delete',
          reason: 'Removed after repeated harassment in the chart discussion',
          previous_event_id: null,
        },
        { action: 'restore', reason: null, previous_event_id: deletion.rows[0]!.id },
        {
          action: 'delete',
          reason: 'A later independent moderation decision',
          previous_event_id: restoration.rows[0]!.id,
        },
      ])

      await expect(
        client.query(`UPDATE admin_comment_moderation_history SET reason = 'History rewrite' WHERE id = $1`, [
          deletion.rows[0]!.id,
        ]),
      ).rejects.toMatchObject({ code: '55000' })
      await expect(
        client.query(`DELETE FROM admin_comment_moderation_history WHERE id = $1`, [deletion.rows[0]!.id]),
      ).rejects.toMatchObject({ code: '55000' })
      await expect(
        client.query(
          `UPDATE admin_comment_moderation_state
              SET deletion_reason = 'Projection rewrite'
            WHERE comment_id = $1`,
          [parentId],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'admin_comment_moderation_state_projection_guard',
      })
      await expect(
        client.query(`DELETE FROM admin_comment_moderation_state WHERE comment_id = $1`, [parentId]),
      ).rejects.toMatchObject({ code: '55000' })

      // The legacy CASCADE remains untouched for online rollout compatibility,
      // while the immutable-row trigger makes account cleanup fail atomically
      // before it can erase an original or any descendants.
      await expect(client.query(`DELETE FROM "user" WHERE id = 'author-user'`)).rejects.toMatchObject({
        code: '55000',
        constraint: 'comments_immutable_guard',
      })
      await expect(client.query(`DELETE FROM "user" WHERE id = 'actor-user'`)).rejects.toMatchObject({
        code: expect.stringMatching(/^(23001|23503)$/),
      })
      const retainedAfterCleanup = await client.query<{
        readonly comment_count: string
        readonly event_count: string
      }>(
        `SELECT (SELECT count(*)::text FROM comments WHERE created_by = 'author-user') AS comment_count,
                (SELECT count(*)::text FROM admin_comment_moderation_history WHERE comment_id = $1) AS event_count`,
        [parentId],
      )
      expect(retainedAfterCleanup.rows).toEqual([{ comment_count: '3', event_count: '3' }])

      const runtimeCommentId = await insertComment(client, 'runtime-author', 'Runtime moderation target')
      await client.query(`GRANT SELECT, INSERT ON admin_comment_moderation_history TO ${RUNTIME_ROLE}`)
      await client.query(`GRANT USAGE, SELECT ON SEQUENCE admin_comment_moderation_history_id_seq TO ${RUNTIME_ROLE}`)
      await client.query(`GRANT SELECT, INSERT, UPDATE ON admin_comment_moderation_state TO ${RUNTIME_ROLE}`)
      await client.query(`GRANT SELECT, INSERT ON comments TO ${RUNTIME_ROLE}`)
      await client.query(`GRANT USAGE, SELECT ON SEQUENCE comments_id_seq TO ${RUNTIME_ROLE}`)
      await client.query(`SET ROLE ${RUNTIME_ROLE}`)
      try {
        const runtimeInsertedCommentId = await insertComment(client, 'runtime-author', 'Runtime-created immutable body')
        expect(BigInt(runtimeInsertedCommentId)).toBeGreaterThan(BigInt(runtimeCommentId))

        const runtimeDeletion = await insertEvent(client, runtimeCommentId, {
          actorUserId: 'runtime-actor',
          reason: 'Runtime-created moderation event',
        })
        await projectEvent(client, runtimeDeletion.rows[0]!.id)
        const runtimeRestoration = await insertEvent(client, runtimeCommentId, {
          actorUserId: 'runtime-actor',
          previousEventId: runtimeDeletion.rows[0]!.id,
          action: 'restore',
          reason: null,
        })
        await projectEvent(client, runtimeRestoration.rows[0]!.id, true)
        const runtimeState = await client.query(
          `SELECT established_action, established_by_event_id::text
             FROM admin_comment_moderation_state
            WHERE comment_id = $1`,
          [runtimeCommentId],
        )
        expect(runtimeState.rows).toEqual([
          { established_action: 'restore', established_by_event_id: runtimeRestoration.rows[0]!.id },
        ])

        await expect(
          client.query(`UPDATE admin_comment_moderation_history SET reason = 'Runtime rewrite' WHERE id = $1`, [
            runtimeDeletion.rows[0]!.id,
          ]),
        ).rejects.toMatchObject({ code: '42501' })
        await expect(
          client.query(`DELETE FROM admin_comment_moderation_history WHERE id = $1`, [runtimeDeletion.rows[0]!.id]),
        ).rejects.toMatchObject({ code: '42501' })
        await expect(client.query(`TRUNCATE admin_comment_moderation_history`)).rejects.toMatchObject({ code: '42501' })
        await expect(
          client.query(`DELETE FROM admin_comment_moderation_state WHERE comment_id = $1`, [runtimeCommentId]),
        ).rejects.toMatchObject({ code: '42501' })
        await expect(
          client.query(`UPDATE comments SET content = 'Runtime rewrite' WHERE id = $1`, [runtimeCommentId]),
        ).rejects.toMatchObject({ code: '42501' })
        await expect(client.query(`DELETE FROM comments WHERE id = $1`, [runtimeCommentId])).rejects.toMatchObject({
          code: '42501',
        })
        await expect(client.query(`TRUNCATE comments`)).rejects.toMatchObject({ code: '42501' })
      } finally {
        await client.query('RESET ROLE')
      }
    } finally {
      client.release()
    }
  })
})