import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_NAME = 'dxrating_admin_user_ban_migration_test'
const RUNTIME_ROLE = 'dxrating_admin_user_ban_runtime_test'
const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Administrator user-ban migration tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })
const EXPANSION_MIGRATION_TAG = '0016_add_admin_user_bans'
const PROTECTION_MIGRATION_TAG = '0017_protect_admin_user_bans'

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

type BanHistoryOverrides = Partial<{
  subjectUserId: string
  actorUserId: string
  previousEventId: string | null
  action: 'ban' | 'unban'
  reason: string | null
  banStartedAt: string | null
  expiresAt: string | null
  requestCorrelationId: string | null
  createdAt: string
}>

const insertHistory = async (client: PoolClient, overrides: BanHistoryOverrides = {}) => {
  const now = Date.now()
  const values = {
    subjectUserId: 'subject-user',
    actorUserId: 'actor-user',
    previousEventId: null,
    action: 'ban' as const,
    reason: 'Repeated harassment after a warning',
    banStartedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    requestCorrelationId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
    createdAt: '2000-01-01T00:00:00Z',
    ...overrides,
  }

  return client.query<{
    readonly id: string
    readonly ban_started_at: Date | null
    readonly expires_at: Date | null
    readonly created_at: Date
  }>(
    `INSERT INTO admin_user_ban_history
       (subject_user_id, actor_user_id, previous_event_id, action, reason,
        ban_started_at, expires_at, request_correlation_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id::text, ban_started_at, expires_at, created_at`,
    [
      values.subjectUserId,
      values.actorUserId,
      values.previousEventId,
      values.action,
      values.reason,
      values.banStartedAt,
      values.expiresAt,
      values.requestCorrelationId,
      values.createdAt,
    ],
  )
}

const projectEvent = async (client: PoolClient, eventId: string, update = false) =>
  client.query(
    update
      ? `UPDATE admin_user_ban_state AS state
           SET established_action = event.action,
               ban_started_at = event.ban_started_at,
               ban_expires_at = event.expires_at,
               ban_reason = CASE WHEN event.action = 'ban' THEN event.reason ELSE NULL END,
               actor_user_id = event.actor_user_id,
               established_by_event_id = event.id
          FROM admin_user_ban_history AS event
         WHERE state.subject_user_id = event.subject_user_id
           AND event.id = $1`
      : `INSERT INTO admin_user_ban_state
           (subject_user_id, established_action, ban_started_at, ban_expires_at,
            ban_reason, actor_user_id, established_by_event_id)
         SELECT subject_user_id,
                action,
                ban_started_at,
                expires_at,
                CASE WHEN action = 'ban' THEN reason ELSE NULL END,
                actor_user_id,
                id
           FROM admin_user_ban_history
          WHERE id = $1`,
    [eventId],
  )

describe('administrator user-ban migrations', () => {
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

  it('adds mixed-version-safe state and enforces an immutable, linear event history', async () => {
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
        /^(?:CREATE TABLE "admin_user_ban_(?:history|state)"|ALTER TABLE "admin_user_ban_(?:history|state)"|CREATE (?:UNIQUE )?INDEX "admin_user_ban_history_)/,
      )
    }
    const expansionSql = expansion!.sql.join('\n')
    expect(expansionSql).not.toMatch(/(?:^|\n)\s*(?:DROP|TRUNCATE|DELETE FROM|UPDATE\s+\S+\s+SET)\b/im)
    expect(expansionSql).toContain('"request_correlation_id" uuid')
    expect(expansionSql).toContain('"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL')
    expect(expansionSql).toContain('"ban_started_at" timestamp (3) with time zone')
    expect(expansionSql).toContain('ON DELETE restrict')

    const protectionSql = protection!.sql.join('\n')
    expect(protectionSql).toContain('BEFORE INSERT OR UPDATE OR DELETE')
    expect(protectionSql).toContain('NEW.created_at := clock_timestamp()::timestamptz(3)')
    expect(protectionSql).toContain('ban state updates must advance exactly one event')
    expect(protectionSql).toContain('active ban state must exactly match its establishing event snapshot')
    expect(protectionSql).toContain('REVOKE ALL PRIVILEGES ON TABLE "public"."admin_user_ban_history" FROM PUBLIC')
    expect(protectionSql).toContain(
      'REVOKE ALL PRIVILEGES ON SEQUENCE "public"."admin_user_ban_history_id_seq" FROM PUBLIC',
    )
    expect(protectionSql).toContain('REVOKE ALL PRIVILEGES ON TABLE "public"."admin_user_ban_state" FROM PUBLIC')

    const client = await migrationPool.connect()
    try {
      for (const previous of migrations.slice(0, expansionIndex)) await applyStatements(client, previous.sql)

      await insertUser(client, 'subject-user')
      await insertUser(client, 'actor-user', 'admin')
      await insertUser(client, 'other-subject')
      await insertUser(client, 'permanent-subject')
      await insertUser(client, 'runtime-subject')

      await applyStatements(client, expansion!.sql)

      // The generated expansion is independently safe if deployment is
      // interrupted before protection is installed. The old application can
      // still create and update users and their content without a backfill.
      await insertUser(client, 'mixed-version-user')
      await client.query(
        `INSERT INTO profiles (id, display_name)
         VALUES ('mixed-version-user', 'Mixed Version User')`,
      )
      await client.query(
        `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, content)
         VALUES ('mixed-version-user', 'mixed-song', 'dx', 'master', 'Existing content remains available')`,
      )
      await client.query(
        `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, content)
         VALUES ('subject-user', 'moderated-song', 'dx', 'master', 'Moderated account content remains available')`,
      )
      await client.query(`UPDATE "user" SET name = 'Mixed Version Updated' WHERE id = 'mixed-version-user'`)
      const oldShape = await client.query<{ readonly name: string; readonly comment_count: string }>(
        `SELECT users.name, count(comments.id)::text AS comment_count
           FROM "user" AS users
           LEFT JOIN comments ON comments.created_by = users.id
          WHERE users.id = 'mixed-version-user'
          GROUP BY users.id`,
      )
      expect(oldShape.rows).toEqual([{ name: 'Mixed Version Updated', comment_count: '1' }])

      await applyStatements(client, protection!.sql)

      const historyColumns = await client.query<{
        readonly column_name: string
        readonly data_type: string
        readonly is_nullable: string
        readonly datetime_precision: number | null
      }>(
        `SELECT column_name, data_type, is_nullable, datetime_precision
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'admin_user_ban_history'
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
        { column_name: 'subject_user_id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'actor_user_id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'previous_event_id', data_type: 'bigint', is_nullable: 'YES' },
        { column_name: 'action', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'reason', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'ban_started_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
        { column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
        { column_name: 'request_correlation_id', data_type: 'uuid', is_nullable: 'YES' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ])
      expect(
        historyColumns.rows
          .filter(({ column_name }) => ['ban_started_at', 'expires_at', 'created_at'].includes(column_name))
          .map(({ datetime_precision }) => datetime_precision),
      ).toEqual([3, 3, 3])

      const stateColumns = await client.query<{ readonly column_name: string; readonly is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'admin_user_ban_state'
          ORDER BY ordinal_position`,
      )
      expect(stateColumns.rows).toEqual([
        { column_name: 'subject_user_id', is_nullable: 'NO' },
        { column_name: 'established_action', is_nullable: 'NO' },
        { column_name: 'ban_started_at', is_nullable: 'YES' },
        { column_name: 'ban_expires_at', is_nullable: 'YES' },
        { column_name: 'ban_reason', is_nullable: 'YES' },
        { column_name: 'actor_user_id', is_nullable: 'NO' },
        { column_name: 'established_by_event_id', is_nullable: 'NO' },
      ])

      const foreignKeys = await client.query<{
        readonly table_name: string
        readonly constraint_name: string
        readonly delete_action: string
      }>(
        `SELECT child.relname AS table_name,
                fk.conname AS constraint_name,
                CASE fk.confdeltype WHEN 'r' THEN 'RESTRICT' ELSE fk.confdeltype::text END AS delete_action
           FROM pg_constraint AS fk
           JOIN pg_class AS child ON child.oid = fk.conrelid
          WHERE fk.contype = 'f'
            AND child.relname IN ('admin_user_ban_history', 'admin_user_ban_state')
          ORDER BY child.relname, fk.conname`,
      )
      expect(foreignKeys.rows).toHaveLength(6)
      expect(foreignKeys.rows.every(({ delete_action }) => delete_action === 'RESTRICT')).toBe(true)

      const indexes = await client.query<{ readonly indexname: string; readonly indexdef: string }>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'admin_user_ban_history'
          ORDER BY indexname`,
      )
      expect(indexes.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            indexname: 'admin_user_ban_history_subject_created_idx',
            indexdef: expect.stringContaining('(subject_user_id, created_at DESC NULLS LAST, id DESC NULLS LAST)'),
          }),
          expect.objectContaining({
            indexname: 'admin_user_ban_history_subject_root_unique',
            indexdef: expect.stringContaining('WHERE (previous_event_id IS NULL)'),
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
           FROM (VALUES ('admin_user_ban_history'), ('admin_user_ban_state')) AS tables(table_name)
           LEFT JOIN information_schema.role_table_grants AS grants
             ON grants.table_schema = 'public'
            AND grants.table_name = tables.table_name
            AND grants.grantee = 'PUBLIC'
          GROUP BY tables.table_name
          ORDER BY tables.table_name`,
      )
      expect(publicPrivileges.rows).toEqual([
        { table_name: 'admin_user_ban_history', public_privileges: null },
        { table_name: 'admin_user_ban_state', public_privileges: null },
      ])

      await client.query(`INSERT INTO profiles (id, display_name) VALUES ('subject-user', 'Subject User')`)
      await client.query(
        `INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
         VALUES ('subject-account', 'subject-provider-id', 'credential', 'subject-user', clock_timestamp())`,
      )

      const beforeInsert = await client.query<{ readonly recorded_at: Date }>(`SELECT clock_timestamp() AS recorded_at`)
      const firstBan = await insertHistory(client)
      const afterInsert = await client.query<{ readonly recorded_at: Date }>(`SELECT clock_timestamp() AS recorded_at`)
      expect(firstBan.rows).toHaveLength(1)
      expect(firstBan.rows[0]?.id).toBe('1')
      expect(firstBan.rows[0]!.created_at.getTime()).toBeGreaterThanOrEqual(
        beforeInsert.rows[0]!.recorded_at.getTime() - 1,
      )
      expect(firstBan.rows[0]!.created_at.getTime()).toBeLessThanOrEqual(afterInsert.rows[0]!.recorded_at.getTime() + 1)
      expect(firstBan.rows[0]!.created_at.toISOString()).not.toBe('2000-01-01T00:00:00.000Z')
      await projectEvent(client, firstBan.rows[0]!.id)

      const activeTemporary = await client.query<{
        readonly established_action: string
        readonly active: boolean
        readonly permanent: boolean
      }>(
        `SELECT established_action,
                established_action = 'ban'
                  AND (ban_expires_at IS NULL OR ban_expires_at > clock_timestamp()) AS active,
                established_action = 'ban' AND ban_expires_at IS NULL AS permanent
           FROM admin_user_ban_state
          WHERE subject_user_id = 'subject-user'`,
      )
      expect(activeTemporary.rows).toEqual([{ established_action: 'ban', active: true, permanent: false }])

      const permanentBan = await insertHistory(client, {
        subjectUserId: 'permanent-subject',
        reason: 'Permanent abuse ban',
        expiresAt: null,
      })
      await projectEvent(client, permanentBan.rows[0]!.id)
      const permanentState = await client.query<{ readonly active: boolean; readonly permanent: boolean }>(
        `SELECT established_action = 'ban'
                  AND (ban_expires_at IS NULL OR ban_expires_at > clock_timestamp()) AS active,
                established_action = 'ban' AND ban_expires_at IS NULL AS permanent
           FROM admin_user_ban_state
          WHERE subject_user_id = 'permanent-subject'`,
      )
      expect(permanentState.rows).toEqual([{ active: true, permanent: true }])

      const firstStartedAt = firstBan.rows[0]!.ban_started_at!.toISOString()
      const replacement = await insertHistory(client, {
        previousEventId: firstBan.rows[0]!.id,
        reason: 'Extended after continued harassment',
        banStartedAt: firstStartedAt,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      })
      await projectEvent(client, replacement.rows[0]!.id, true)
      const replacementState = await client.query<{
        readonly ban_started_at: Date
        readonly established_by_event_id: string
        readonly history_count: string
      }>(
        `SELECT state.ban_started_at,
                state.established_by_event_id::text,
                count(history.id)::text AS history_count
           FROM admin_user_ban_state AS state
           JOIN admin_user_ban_history AS history ON history.subject_user_id = state.subject_user_id
          WHERE state.subject_user_id = 'subject-user'
          GROUP BY state.subject_user_id`,
      )
      expect(replacementState.rows).toEqual([
        {
          ban_started_at: firstBan.rows[0]!.ban_started_at,
          established_by_event_id: replacement.rows[0]!.id,
          history_count: '2',
        },
      ])

      const unban = await insertHistory(client, {
        previousEventId: replacement.rows[0]!.id,
        action: 'unban',
        reason: null,
        banStartedAt: null,
        expiresAt: null,
        requestCorrelationId: null,
      })
      await projectEvent(client, unban.rows[0]!.id, true)
      const unbanned = await client.query<{
        readonly established_action: string
        readonly active: boolean
        readonly ban_started_at: Date | null
        readonly ban_expires_at: Date | null
        readonly ban_reason: string | null
        readonly established_by_event_id: string
      }>(
        `SELECT established_action,
                established_action = 'ban'
                  AND (ban_expires_at IS NULL OR ban_expires_at > clock_timestamp()) AS active,
                ban_started_at,
                ban_expires_at,
                ban_reason,
                established_by_event_id::text
           FROM admin_user_ban_state
          WHERE subject_user_id = 'subject-user'`,
      )
      expect(unbanned.rows).toEqual([
        {
          established_action: 'unban',
          active: false,
          ban_started_at: null,
          ban_expires_at: null,
          ban_reason: null,
          established_by_event_id: unban.rows[0]!.id,
        },
      ])
      const optionalUnbanReason = await client.query<{ readonly reason: string | null }>(
        `SELECT reason FROM admin_user_ban_history WHERE id = $1`,
        [unban.rows[0]!.id],
      )
      expect(optionalUnbanReason.rows).toEqual([{ reason: null }])
      const neverModerated = await client.query(
        `SELECT 1 FROM admin_user_ban_state WHERE subject_user_id = 'other-subject'`,
      )
      expect(neverModerated.rows).toEqual([])

      const databaseClock = await client.query<{ readonly now: Date }>(`SELECT clock_timestamp() AS now`)
      const shortExpiry = new Date(databaseClock.rows[0]!.now.getTime() + 1_000).toISOString()
      const shortBan = await insertHistory(client, {
        subjectUserId: 'other-subject',
        reason: 'Short test ban',
        expiresAt: shortExpiry,
        requestCorrelationId: null,
      })
      await projectEvent(client, shortBan.rows[0]!.id)
      const shortBanInitiallyActive = await client.query<{ readonly active: boolean }>(
        `SELECT established_action = 'ban'
                  AND (ban_expires_at IS NULL OR ban_expires_at > clock_timestamp()) AS active
           FROM admin_user_ban_state
          WHERE subject_user_id = 'other-subject'`,
      )
      expect(shortBanInitiallyActive.rows).toEqual([{ active: true }])
      await client.query(
        `SELECT pg_sleep(
           greatest(0, extract(epoch FROM ($1::timestamptz - clock_timestamp())))::double precision + 0.05
         )`,
        [shortExpiry],
      )
      const expired = await client.query<{ readonly active: boolean; readonly expired: boolean }>(
        `SELECT established_action = 'ban'
                  AND (ban_expires_at IS NULL OR ban_expires_at > clock_timestamp()) AS active,
                established_action = 'ban'
                  AND ban_expires_at <= clock_timestamp() AS expired
           FROM admin_user_ban_state
          WHERE subject_user_id = 'other-subject'`,
      )
      expect(expired.rows).toEqual([{ active: false, expired: true }])

      for (const reason of ['', '   ', '\tleading', 'trailing\n', ' leading', 'trailing ', 'x'.repeat(1001)]) {
        await expect(insertHistory(client, { subjectUserId: 'runtime-subject', reason })).rejects.toMatchObject({
          code: '23514',
        })
      }
      await expect(
        insertHistory(client, {
          subjectUserId: 'runtime-subject',
          action: 'unban',
          reason: '   ',
          banStartedAt: null,
          expiresAt: null,
        }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'admin_user_ban_history_root_action_guard',
      })
      await expect(
        insertHistory(client, {
          subjectUserId: 'runtime-subject',
          action: 'unban',
          reason: null,
          banStartedAt: null,
          expiresAt: null,
        }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'admin_user_ban_history_root_action_guard',
      })
      await expect(
        insertHistory(client, {
          subjectUserId: 'subject-user',
          previousEventId: unban.rows[0]!.id,
          action: 'unban',
          reason: null,
          banStartedAt: null,
          expiresAt: null,
        }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'admin_user_ban_history_active_unban_guard',
      })
      await expect(
        insertHistory(client, {
          subjectUserId: 'other-subject',
          previousEventId: shortBan.rows[0]!.id,
          action: 'unban',
          reason: null,
          banStartedAt: null,
          expiresAt: null,
        }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'admin_user_ban_history_active_unban_guard',
      })

      await expect(
        insertHistory(client, {
          subjectUserId: 'subject-user',
          previousEventId: unban.rows[0]!.id,
          reason: 'Already expired input',
          banStartedAt: new Date(Date.now() - 60_000).toISOString(),
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertHistory(client, {
          subjectUserId: 'subject-user',
          previousEventId: unban.rows[0]!.id,
          action: 'unban',
          reason: null,
          banStartedAt: null,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      ).rejects.toMatchObject({ code: '23514' })

      await expect(
        insertHistory(client, {
          subjectUserId: 'other-subject',
          previousEventId: unban.rows[0]!.id,
          reason: 'Wrong subject chain',
        }),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        insertHistory(client, {
          previousEventId: replacement.rows[0]!.id,
          reason: 'Attempted branch',
          banStartedAt: firstStartedAt,
        }),
      ).rejects.toMatchObject({ code: '23514' })

      await expect(
        client.query(
          `UPDATE admin_user_ban_state
              SET ban_reason = 'Projection rewrite'
            WHERE subject_user_id = 'subject-user'`,
        ),
      ).rejects.toMatchObject({ code: '23514' })
      await expect(
        client.query(`DELETE FROM admin_user_ban_state WHERE subject_user_id = 'subject-user'`),
      ).rejects.toMatchObject({
        code: '55000',
      })
      await expect(
        client.query(`UPDATE admin_user_ban_history SET reason = 'History rewrite' WHERE id = $1`, [
          firstBan.rows[0]!.id,
        ]),
      ).rejects.toMatchObject({ code: '55000' })
      await expect(
        client.query(`DELETE FROM admin_user_ban_history WHERE id = $1`, [firstBan.rows[0]!.id]),
      ).rejects.toMatchObject({ code: '55000' })

      await client.query(`DELETE FROM profiles WHERE id = 'subject-user'`)
      await client.query(`DELETE FROM account WHERE id = 'subject-account'`)
      const retainedAfterIdentityChanges = await client.query<{
        readonly comment_count: string
        readonly history_count: string
      }>(
        `SELECT (SELECT count(*)::text FROM comments WHERE created_by = 'subject-user') AS comment_count,
                (SELECT count(*)::text FROM admin_user_ban_history WHERE subject_user_id = 'subject-user') AS history_count`,
      )
      expect(retainedAfterIdentityChanges.rows).toEqual([{ comment_count: '1', history_count: '3' }])
      await expect(client.query(`DELETE FROM "user" WHERE id = 'subject-user'`)).rejects.toMatchObject({
        code: expect.stringMatching(/^(23001|23503)$/),
      })
      await expect(client.query(`DELETE FROM "user" WHERE id = 'actor-user'`)).rejects.toMatchObject({
        code: expect.stringMatching(/^(23001|23503)$/),
      })

      await client.query(`GRANT SELECT, INSERT ON admin_user_ban_history TO ${RUNTIME_ROLE}`)
      await client.query(`GRANT USAGE, SELECT ON SEQUENCE admin_user_ban_history_id_seq TO ${RUNTIME_ROLE}`)
      await client.query(`GRANT SELECT, INSERT, UPDATE ON admin_user_ban_state TO ${RUNTIME_ROLE}`)
      await client.query(`SET ROLE ${RUNTIME_ROLE}`)
      try {
        const runtimeBan = await insertHistory(client, {
          subjectUserId: 'runtime-subject',
          reason: 'Runtime-created permanent ban',
          expiresAt: null,
          requestCorrelationId: null,
        })
        await projectEvent(client, runtimeBan.rows[0]!.id)
        const runtimeRead = await client.query<{ readonly event_count: string; readonly state_count: string }>(
          `SELECT (SELECT count(*)::text FROM admin_user_ban_history WHERE subject_user_id = 'runtime-subject') AS event_count,
                  (SELECT count(*)::text FROM admin_user_ban_state WHERE subject_user_id = 'runtime-subject') AS state_count`,
        )
        expect(runtimeRead.rows).toEqual([{ event_count: '1', state_count: '1' }])

        const runtimeUnban = await insertHistory(client, {
          subjectUserId: 'runtime-subject',
          previousEventId: runtimeBan.rows[0]!.id,
          action: 'unban',
          reason: null,
          banStartedAt: null,
          expiresAt: null,
          requestCorrelationId: null,
        })
        await projectEvent(client, runtimeUnban.rows[0]!.id, true)
        const runtimeAdvancedState = await client.query<{
          readonly established_action: string
          readonly established_by_event_id: string
          readonly event_count: string
        }>(
          `SELECT state.established_action,
                  state.established_by_event_id::text,
                  count(history.id)::text AS event_count
             FROM admin_user_ban_state AS state
             JOIN admin_user_ban_history AS history ON history.subject_user_id = state.subject_user_id
            WHERE state.subject_user_id = 'runtime-subject'
            GROUP BY state.subject_user_id`,
        )
        expect(runtimeAdvancedState.rows).toEqual([
          {
            established_action: 'unban',
            established_by_event_id: runtimeUnban.rows[0]!.id,
            event_count: '2',
          },
        ])

        await expect(
          client.query(`UPDATE admin_user_ban_history SET reason = 'Runtime rewrite' WHERE id = $1`, [
            runtimeBan.rows[0]!.id,
          ]),
        ).rejects.toMatchObject({ code: '42501' })
        await expect(
          client.query(`DELETE FROM admin_user_ban_history WHERE id = $1`, [runtimeBan.rows[0]!.id]),
        ).rejects.toMatchObject({ code: '42501' })
        await expect(client.query(`TRUNCATE admin_user_ban_history`)).rejects.toMatchObject({ code: '42501' })
        await expect(
          client.query(`DELETE FROM admin_user_ban_state WHERE subject_user_id = 'runtime-subject'`),
        ).rejects.toMatchObject({
          code: '42501',
        })
        await expect(client.query(`TRUNCATE admin_user_ban_state`)).rejects.toMatchObject({ code: '42501' })
      } finally {
        await client.query('RESET ROLE')
      }
    } finally {
      client.release()
    }
  })
})