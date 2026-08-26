import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { USER_IDENTITY_ADVISORY_LOCK_SEED } from '../user-identity-advisory-lock.js'

const DATABASE_NAME = 'dxrating_active_user_ban_write_guard_test'
const RUNTIME_ROLE = 'dxrating_active_user_ban_write_guard_runtime_test'
const MIGRATION_TAG = '0018_enforce_active_user_bans'
const BAN_DENIAL_CODE = 'DXB01'
const BAN_DENIAL_CONSTRAINT = 'active_user_ban_write_guard'
const BAN_DENIAL_MESSAGE = 'account mutation is not permitted'

const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
  throw new Error('Active user-ban write-guard tests require the configured dxrating_test database')
}

const adminDatabaseUrl = new URL(configuredDatabaseUrl)
adminDatabaseUrl.pathname = '/postgres'
const migrationDatabaseUrl = new URL(configuredDatabaseUrl)
migrationDatabaseUrl.pathname = `/${DATABASE_NAME}`
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder })
const migrationJournal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as {
  readonly entries: readonly { readonly idx: number; readonly tag: string }[]
}
const migrationIndex = migrationJournal.entries.findIndex(({ tag }) => tag === MIGRATION_TAG)
const migration = migrations[migrationIndex]
if (!migration) throw new Error(`Missing ${MIGRATION_TAG} migration`)

type MigrationLockRehearsal = {
  readonly failureCode: string | undefined
  readonly elapsedMilliseconds: number
  readonly guardObjectCountAfterRollback: number
  readonly ordinaryWriteCount: number
}

let migrationLockRehearsal: MigrationLockRehearsal | undefined

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

const insertUser = async (client: Pool | PoolClient, userId: string, role: 'user' | 'admin' = 'user') => {
  await client.query(
    `INSERT INTO "user" (id, name, email, role)
     VALUES ($1, $2, $3, $4)`,
    [userId, userId, `${userId}@example.test`, role],
  )
}

const insertIdentityFixtures = async (client: Pool | PoolClient, userId: string) => {
  await client.query(
    `INSERT INTO "session" (id, expires_at, token, updated_at, user_id)
     VALUES ($1, clock_timestamp() + interval '1 day', $2, clock_timestamp(), $3)`,
    [`${userId}-session`, `${userId}-token`, userId],
  )
  await client.query(
    `INSERT INTO account
       (id, account_id, provider_id, user_id, access_token, password, updated_at)
     VALUES ($1, $2, 'credential', $3, 'initial-access-token', 'initial-password', clock_timestamp())`,
    [`${userId}-account`, `${userId}-provider-account`, userId],
  )
  await client.query(
    `INSERT INTO passkey
       (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, transports, created_at, aaguid)
     VALUES ($1, 'Primary key', 'public-key', $2, $3, 3, 'singleDevice', false, 'internal',
             clock_timestamp(), '00000000-0000-0000-0000-000000000000')`,
    [`${userId}-passkey`, userId, `${userId}-credential`],
  )
}

const insertPrimaryAuthFixtures = async (client: Pool | PoolClient, userId: string) => {
  await client.query(
    `WITH proof_clock AS (SELECT clock_timestamp()::timestamptz(3) AS now)
     INSERT INTO admin_primary_auth_windows
       (session_id, user_id, method, completed_at, expires_at)
     SELECT $1, $2, 'password', now, now + interval '10 minutes'
     FROM proof_clock`,
    [`${userId}-session`, userId],
  )
  await client.query(
    `WITH attempt_clock AS (SELECT clock_timestamp()::timestamptz(3) AS now)
     INSERT INTO admin_primary_auth_oauth_attempts
       (state_digest, session_id, user_id, account_id, provider,
        provider_account_id, code_verifier, nonce, redirect_uri,
        created_at, expires_at)
     SELECT repeat('a', 64), $1, $2, $3, 'google', $4, repeat('V', 64),
            'test-nonce', 'https://api.example.test/admin/oauth/callback',
            now, now + interval '10 minutes'
     FROM attempt_clock`,
    [`${userId}-session`, userId, `${userId}-account`, `${userId}-provider-account`],
  )
}

const appendBan = async (client: Pool | PoolClient, userId: string, reason: string, expiresAt: Date | null = null) => {
  const event = await client.query<{ readonly id: string }>(
    `INSERT INTO admin_user_ban_history
       (subject_user_id, actor_user_id, previous_event_id, action, reason, ban_started_at, expires_at)
     VALUES ($1, 'ban-actor', NULL, 'ban', $2, clock_timestamp(), $3)
     RETURNING id::text`,
    [userId, reason, expiresAt],
  )
  const eventId = event.rows[0]!.id
  await projectEvent(client, eventId)
  return eventId
}

const projectEvent = async (client: Pool | PoolClient, eventId: string, update = false) =>
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

const appendUnban = async (client: Pool | PoolClient, userId: string, previousEventId: string) => {
  const event = await client.query<{ readonly id: string }>(
    `INSERT INTO admin_user_ban_history
       (subject_user_id, actor_user_id, previous_event_id, action, reason, ban_started_at, expires_at)
     VALUES ($1, 'ban-actor', $2, 'unban', NULL, NULL, NULL)
     RETURNING id::text`,
    [userId, previousEventId],
  )
  await projectEvent(client, event.rows[0]!.id, true)
}

type PostgresFailure = Error & {
  readonly code?: string
  readonly constraint?: string
  readonly detail?: string
  readonly hint?: string
}

const expectBanDenial = async (operation: Promise<unknown>, privateValues: readonly string[] = []) => {
  let rejection: PostgresFailure | undefined
  try {
    await operation
  } catch (error) {
    rejection = error as PostgresFailure
  }

  expect(rejection).toMatchObject({
    code: BAN_DENIAL_CODE,
    constraint: BAN_DENIAL_CONSTRAINT,
    message: BAN_DENIAL_MESSAGE,
  })
  const disclosedText = [rejection?.message, rejection?.detail, rejection?.hint].filter(Boolean).join(' ')
  for (const privateValue of privateValues) expect(disclosedText).not.toContain(privateValue)
}

const waitForScheduling = () => new Promise((resolve) => setTimeout(resolve, 75))

describe('active user-ban identity write guards', () => {
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString() })
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl.toString() })

  beforeAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`)
    await adminPool.query(`CREATE ROLE ${RUNTIME_ROLE} NOLOGIN`)
    await adminPool.query(`CREATE DATABASE ${DATABASE_NAME}`)

    const client = await migrationPool.connect()
    const blocker = await migrationPool.connect()
    try {
      for (const previous of migrations.slice(0, migrationIndex)) await applyStatements(client, previous.sql)
      await insertUser(client, 'migration-lock-rehearsal-user')

      await blocker.query('BEGIN')
      await blocker.query('LOCK TABLE "public"."account" IN ROW EXCLUSIVE MODE')

      const startedAt = Date.now()
      let failure: PostgresFailure | undefined
      try {
        await applyStatements(client, migration.sql)
      } catch (error) {
        failure = error as PostgresFailure
      }
      const elapsedMilliseconds = Date.now() - startedAt

      const guardObjects = await client.query<{ readonly count: number }>(
        `
          SELECT (
            SELECT count(*)::integer
            FROM pg_proc
            INNER JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
            WHERE pg_namespace.nspname = 'public'
              AND pg_proc.proname IN (
                'assert_no_active_user_ban',
                'lock_admin_user_ban_state_subject',
                'revoke_active_user_ban_sessions',
                'guard_active_user_ban_session',
                'guard_active_user_ban_account',
                'guard_active_user_ban_user',
                'guard_active_user_ban_passkey'
              )
          ) + (
            SELECT count(*)::integer
            FROM pg_trigger
            WHERE NOT tgisinternal
              AND tgname IN (
                'admin_user_ban_state_00_subject_lock',
                'admin_user_ban_state_zz_session_revocation',
                'active_user_ban_session_guard',
                'active_user_ban_account_guard',
                'active_user_ban_user_guard',
                'active_user_ban_passkey_guard'
              )
          ) AS count
        `,
      )

      // ROW EXCLUSIVE is compatible with the ordinary writer's table lock.
      // The failed migration must not remain queued or retain its earlier
      // user/session preflight locks while this unrelated write commits.
      await client.query(
        `
          INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
          VALUES (
            'migration-lock-rehearsal-account',
            'migration-lock-rehearsal-provider',
            'credential',
            'migration-lock-rehearsal-user',
            clock_timestamp()
          )
        `,
      )
      const ordinaryWrite = await client.query<{ readonly count: number }>(
        `SELECT count(*)::integer AS count FROM account WHERE id = 'migration-lock-rehearsal-account'`,
      )
      migrationLockRehearsal = {
        failureCode: failure?.code,
        elapsedMilliseconds,
        guardObjectCountAfterRollback: guardObjects.rows[0]?.count ?? -1,
        ordinaryWriteCount: ordinaryWrite.rows[0]?.count ?? 0,
      }

      await blocker.query('ROLLBACK')
      await applyStatements(client, migration.sql)
      for (const later of migrations.slice(migrationIndex + 1)) await applyStatements(client, later.sql)
      await insertUser(client, 'ban-actor', 'admin')
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined)
      blocker.release()
      client.release()
    }
  })

  afterAll(async () => {
    await migrationPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`)
    await adminPool.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`)
    await adminPool.end()
  })

  it('is a no-rewrite migration with stable, security-definer database guards', async () => {
    expect(path.basename(migrationsFolder)).toBe('drizzle')
    expect(migrationJournal.entries[migrationIndex]?.tag).toBe(MIGRATION_TAG)
    expect(migrationJournal.entries[migrationIndex]?.idx).toBe(migrationIndex)

    const migrationSql = migrations[migrationIndex]!.sql.join('\n')
    for (const statement of migration.sql) {
      expect(statement.trimStart()).not.toMatch(/^(?:ALTER TABLE|UPDATE\s|DELETE FROM|TRUNCATE|DROP)\b/i)
    }
    expect(migrationSql).toContain("ERRCODE = 'DXB01'")
    expect(migrationSql).toContain("CONSTRAINT = 'active_user_ban_write_guard'")
    expect(migrationSql).toContain('FOR KEY SHARE')
    expect(migrationSql).toContain('FOR UPDATE')
    expect(migrationSql).toContain('FOR UPDATE NOWAIT')
    expect(migrationSql).toContain('DELETE FROM public.session')
    expect(migrationSql).toContain('ORDER BY lock_key')
    expect(migrationSql).not.toContain('pg_advisory_xact_lock_shared')
    expect(migrationSql).toContain('pg_advisory_xact_lock')
    expect(migrationSql.match(new RegExp(String(USER_IDENTITY_ADVISORY_LOCK_SEED), 'g'))).toHaveLength(1)
    expect(migrationSql).not.toContain('NEW.counter >= OLD.counter')

    const triggers = await migrationPool.query<{ readonly trigger_name: string }>(
      `SELECT trigger_name
         FROM information_schema.triggers
        WHERE event_object_schema = 'public'
          AND trigger_name IN (
            'admin_user_ban_state_00_subject_lock',
            'admin_user_ban_state_zz_session_revocation',
            'active_user_ban_session_guard',
            'active_user_ban_account_guard',
            'active_user_ban_user_guard',
            'active_user_ban_passkey_guard'
          )
        GROUP BY trigger_name
        ORDER BY trigger_name`,
    )
    expect(triggers.rows.map(({ trigger_name }) => trigger_name)).toEqual([
      'active_user_ban_account_guard',
      'active_user_ban_passkey_guard',
      'active_user_ban_session_guard',
      'active_user_ban_user_guard',
      'admin_user_ban_state_00_subject_lock',
      'admin_user_ban_state_zz_session_revocation',
    ])

    const functions = await migrationPool.query<{
      readonly function_name: string
      readonly security_definer: boolean
      readonly configuration: string[] | null
    }>(
      `SELECT proname AS function_name,
              prosecdef AS security_definer,
              proconfig AS configuration
         FROM pg_proc
         JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
        WHERE pg_namespace.nspname = 'public'
          AND proname IN (
            'assert_no_active_user_ban',
            'lock_admin_user_ban_state_subject',
            'revoke_active_user_ban_sessions',
            'guard_active_user_ban_session',
            'guard_active_user_ban_account',
            'guard_active_user_ban_user',
            'guard_active_user_ban_passkey'
          )
        ORDER BY proname`,
    )
    expect(functions.rows).toHaveLength(7)
    expect(functions.rows.every(({ security_definer }) => security_definer)).toBe(true)
    expect(functions.rows.every(({ configuration }) => configuration?.includes('search_path=pg_catalog, public'))).toBe(
      true,
    )
  })

  it('fails fast before catalog changes when a trigger table is busy, then applies cleanly on retry', () => {
    expect(migration.sql[0]).toContain('LOCK TABLE')
    expect(migration.sql[0]).toContain('IN SHARE ROW EXCLUSIVE MODE NOWAIT')
    const targetOrder = [
      '"public"."user"',
      '"public"."session"',
      '"public"."account"',
      '"public"."passkey"',
      '"public"."admin_user_ban_state"',
    ]
    for (let index = 1; index < targetOrder.length; index += 1) {
      expect(migration.sql[0]!.indexOf(targetOrder[index - 1]!)).toBeLessThan(
        migration.sql[0]!.indexOf(targetOrder[index]!),
      )
    }

    expect(migrationLockRehearsal).toEqual({
      failureCode: '55P03',
      elapsedMilliseconds: expect.any(Number),
      guardObjectCountAfterRollback: 0,
      ordinaryWriteCount: 1,
    })
    expect(migrationLockRehearsal!.elapsedMilliseconds).toBeLessThan(1_000)
  })

  it('rejects active-ban identity writes while preserving safe proof, sign-out, and administrator revocation paths', async () => {
    const userId = 'active-identity-user'
    const privateReason = 'private moderation reason 8237'
    await insertUser(migrationPool, userId, 'admin')
    await insertIdentityFixtures(migrationPool, userId)
    await insertPrimaryAuthFixtures(migrationPool, userId)
    await appendBan(migrationPool, userId, privateReason)

    const revokedAuthentication = await migrationPool.query<{
      readonly sessions: number
      readonly windows: number
      readonly attempts: number
    }>(
      `SELECT
         (SELECT count(*)::integer FROM session WHERE user_id = $1) AS sessions,
         (SELECT count(*)::integer FROM admin_primary_auth_windows WHERE user_id = $1) AS windows,
         (SELECT count(*)::integer FROM admin_primary_auth_oauth_attempts WHERE user_id = $1) AS attempts`,
      [userId],
    )
    expect(revokedAuthentication.rows).toEqual([{ sessions: 0, windows: 0, attempts: 0 }])

    await expectBanDenial(
      migrationPool.query(
        `INSERT INTO "session" (id, expires_at, token, updated_at, user_id)
         VALUES ('blocked-session', clock_timestamp() + interval '1 day', 'blocked-token', clock_timestamp(), $1)`,
        [userId],
      ),
      [userId, privateReason],
    )
    await insertUser(migrationPool, 'session-move-source-user')
    await migrationPool.query(
      `INSERT INTO session (id, expires_at, token, updated_at, user_id)
       VALUES ('session-move-source', clock_timestamp() + interval '1 day',
               'session-move-token', clock_timestamp(), 'session-move-source-user')`,
    )
    await expectBanDenial(
      migrationPool.query(`UPDATE "session" SET user_id = $1 WHERE id = 'session-move-source'`, [userId]),
      [userId, privateReason],
    )

    await expectBanDenial(
      migrationPool.query(
        `INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
         VALUES ('blocked-account', 'blocked-provider-account', 'oauth', $1, clock_timestamp())`,
        [userId],
      ),
      [userId, privateReason],
    )
    await expectBanDenial(
      migrationPool.query(`UPDATE account SET password = 'replacement-password' WHERE user_id = $1`, [userId]),
      [userId, privateReason],
    )
    await expectBanDenial(migrationPool.query(`DELETE FROM account WHERE user_id = $1`, [userId]), [
      userId,
      privateReason,
    ])

    await expectBanDenial(migrationPool.query(`UPDATE "user" SET name = 'Changed profile' WHERE id = $1`, [userId]), [
      userId,
      privateReason,
    ])
    await expectBanDenial(
      migrationPool.query(`UPDATE "user" SET updated_at = clock_timestamp() WHERE id = $1`, [userId]),
      [userId, privateReason],
    )
    await expectBanDenial(migrationPool.query(`DELETE FROM "user" WHERE id = $1`, [userId]), [userId, privateReason])

    await expectBanDenial(migrationPool.query(`UPDATE passkey SET name = 'Renamed key' WHERE user_id = $1`, [userId]), [
      userId,
      privateReason,
    ])
    await expectBanDenial(
      migrationPool.query(`UPDATE passkey SET counter = counter - 1 WHERE user_id = $1`, [userId]),
      [userId, privateReason],
    )
    await expectBanDenial(
      migrationPool.query(`UPDATE passkey SET counter = counter + 1 WHERE user_id = $1`, [userId]),
      [userId, privateReason],
    )
    await expectBanDenial(migrationPool.query(`DELETE FROM passkey WHERE user_id = $1`, [userId]), [
      userId,
      privateReason,
    ])
    await expectBanDenial(
      migrationPool.query(
        `INSERT INTO passkey
           (id, public_key, user_id, credential_id, counter, device_type, backed_up)
         VALUES ('blocked-passkey', 'blocked-public-key', $1, 'blocked-credential', 0, 'singleDevice', false)`,
        [userId],
      ),
      [userId, privateReason],
    )

    await migrationPool.query(
      `UPDATE "user"
          SET admin_authorization_not_before = clock_timestamp() + interval '1 millisecond',
              updated_at = clock_timestamp()
        WHERE id = $1`,
      [userId],
    )
    await migrationPool.query(
      `UPDATE "user"
          SET role = 'user',
              admin_authorization_not_before = clock_timestamp() + interval '2 milliseconds',
              updated_at = clock_timestamp()
        WHERE id = $1`,
      [userId],
    )
    await expectBanDenial(migrationPool.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [userId]), [
      userId,
      privateReason,
    ])
    await expectBanDenial(
      migrationPool.query(
        `UPDATE "user"
            SET admin_authorization_not_before = '2000-01-01T00:00:00Z',
                updated_at = clock_timestamp()
          WHERE id = $1`,
        [userId],
      ),
      [userId, privateReason],
    )

    const retainedIdentity = await migrationPool.query<{
      readonly name: string
      readonly role: string
      readonly counter: number
      readonly account_count: string
    }>(
      `SELECT users.name,
              users.role::text,
              passkeys.counter,
              (SELECT count(*)::text FROM account WHERE user_id = users.id) AS account_count
         FROM "user" AS users
         JOIN passkey AS passkeys ON passkeys.user_id = users.id
        WHERE users.id = $1`,
      [userId],
    )
    expect(retainedIdentity.rows).toEqual([{ name: userId, role: 'user', counter: 3, account_count: '1' }])

    await migrationPool.query(`DELETE FROM "session" WHERE user_id = $1`, [userId])
    const sessions = await migrationPool.query(`SELECT 1 FROM "session" WHERE user_id = $1`, [userId])
    expect(sessions.rows).toEqual([])

    await migrationPool.query(`GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE}`)
    await migrationPool.query(`GRANT SELECT, UPDATE ON account TO ${RUNTIME_ROLE}`)
    await migrationPool.query(`SET ROLE ${RUNTIME_ROLE}`)
    try {
      await expectBanDenial(
        migrationPool.query(`UPDATE account SET access_token = 'runtime-replacement' WHERE user_id = $1`, [userId]),
        [userId, privateReason],
      )
    } finally {
      await migrationPool.query('RESET ROLE')
    }
  })

  it('revokes only a ban state row that was actually persisted', async () => {
    const userId = 'conflict-skipped-ban-user'
    await insertUser(migrationPool, userId)
    const banEventId = await appendBan(migrationPool, userId, 'Initial direct ban')
    await appendUnban(migrationPool, userId, banEventId)
    await migrationPool.query(
      `INSERT INTO session (id, expires_at, token, updated_at, user_id)
       VALUES ('conflict-skipped-session', clock_timestamp() + interval '1 day',
               'conflict-skipped-token', clock_timestamp(), $1)`,
      [userId],
    )

    const skipped = await migrationPool.query(
      `INSERT INTO admin_user_ban_state (
         subject_user_id,
         established_action,
         ban_started_at,
         ban_expires_at,
         ban_reason,
         actor_user_id,
         established_by_event_id
       )
       SELECT
         subject_user_id,
         action,
         ban_started_at,
         expires_at,
         reason,
         actor_user_id,
         id
       FROM admin_user_ban_history
       WHERE id = $1
       ON CONFLICT (subject_user_id) DO NOTHING`,
      [banEventId],
    )
    expect(skipped.rowCount).toBe(0)

    const retained = await migrationPool.query<{ readonly action: string; readonly sessions: number }>(
      `SELECT state.established_action AS action,
              (SELECT count(*)::integer FROM session WHERE user_id = state.subject_user_id) AS sessions
       FROM admin_user_ban_state AS state
       WHERE state.subject_user_id = $1`,
      [userId],
    )
    expect(retained.rows).toEqual([{ action: 'unban', sessions: 1 }])
  })

  it('uses PostgreSQL time so expired and explicitly unbanned accounts can mutate identity data again', async () => {
    const expiredUserId = 'expired-identity-user'
    await insertUser(migrationPool, expiredUserId)
    await insertIdentityFixtures(migrationPool, expiredUserId)
    await insertPrimaryAuthFixtures(migrationPool, expiredUserId)
    const databaseClock = await migrationPool.query<{ readonly now: Date }>(`SELECT clock_timestamp() AS now`)
    const expiresAt = new Date(databaseClock.rows[0]!.now.getTime() + 200)
    await appendBan(migrationPool, expiredUserId, 'short private reason', expiresAt)
    const revokedBeforeExpiry = await migrationPool.query<{ readonly sessions: number; readonly windows: number }>(
      `SELECT
         (SELECT count(*)::integer FROM session WHERE user_id = $1) AS sessions,
         (SELECT count(*)::integer FROM admin_primary_auth_windows WHERE user_id = $1) AS windows`,
      [expiredUserId],
    )
    expect(revokedBeforeExpiry.rows).toEqual([{ sessions: 0, windows: 0 }])
    await migrationPool.query(
      `SELECT pg_sleep(
         greatest(0, extract(epoch FROM ($1::timestamptz - clock_timestamp())))::double precision + 0.03
       )`,
      [expiresAt],
    )

    await migrationPool.query(
      `INSERT INTO "session" (id, expires_at, token, updated_at, user_id)
       VALUES ($1, clock_timestamp() + interval '1 day', $2, clock_timestamp(), $3)`,
      [`${expiredUserId}-fresh-session`, `${expiredUserId}-fresh-token`, expiredUserId],
    )
    await migrationPool.query(`UPDATE "session" SET expires_at = expires_at + interval '1 day' WHERE user_id = $1`, [
      expiredUserId,
    ])
    await migrationPool.query(`UPDATE account SET access_token = 'expired-user-token' WHERE user_id = $1`, [
      expiredUserId,
    ])
    await migrationPool.query(`UPDATE passkey SET name = 'Expired user key' WHERE user_id = $1`, [expiredUserId])
    await migrationPool.query(`UPDATE "user" SET name = 'Expired user profile' WHERE id = $1`, [expiredUserId])
    await migrationPool.query(`DELETE FROM passkey WHERE user_id = $1`, [expiredUserId])
    await migrationPool.query(`DELETE FROM account WHERE user_id = $1`, [expiredUserId])
    await migrationPool.query(`DELETE FROM "session" WHERE user_id = $1`, [expiredUserId])

    const unbannedUserId = 'unbanned-identity-user'
    await insertUser(migrationPool, unbannedUserId)
    const banEventId = await appendBan(migrationPool, unbannedUserId, 'unbanned private reason')
    await appendUnban(migrationPool, unbannedUserId, banEventId)
    await insertIdentityFixtures(migrationPool, unbannedUserId)
    await migrationPool.query(`UPDATE "user" SET email_verified = true WHERE id = $1`, [unbannedUserId])

    const resultingUsers = await migrationPool.query<{
      readonly id: string
      readonly name: string
      readonly email_verified: boolean
    }>(
      `SELECT id, name, email_verified
         FROM "user"
        WHERE id IN ($1, $2)
        ORDER BY id`,
      [expiredUserId, unbannedUserId],
    )
    expect(resultingUsers.rows).toEqual([
      { id: expiredUserId, name: 'Expired user profile', email_verified: false },
      { id: unbannedUserId, name: unbannedUserId, email_verified: true },
    ])
  })

  it('linearizes concurrent session creation and ban projection in either lock order', async () => {
    const banFirstUserId = 'ban-first-race-user'
    await insertUser(migrationPool, banFirstUserId)
    const banFirst = await migrationPool.connect()
    const sessionSecond = await migrationPool.connect()
    let banFirstOpen = false
    let sessionSecondOpen = false
    try {
      await banFirst.query('BEGIN')
      banFirstOpen = true
      const banFirstEvent = await banFirst.query<{ readonly id: string }>(
        `INSERT INTO admin_user_ban_history
           (subject_user_id, actor_user_id, action, reason, ban_started_at)
         VALUES ($1, 'ban-actor', 'ban', 'ban won the race', clock_timestamp())
         RETURNING id::text`,
        [banFirstUserId],
      )
      await projectEvent(banFirst, banFirstEvent.rows[0]!.id)

      await sessionSecond.query('BEGIN')
      sessionSecondOpen = true
      const blockedSession = sessionSecond.query(
        `INSERT INTO "session" (id, expires_at, token, updated_at, user_id)
         VALUES ('ban-first-session', clock_timestamp() + interval '1 day',
                 'ban-first-token', clock_timestamp(), $1)`,
        [banFirstUserId],
      )
      let sessionSettled = false
      void blockedSession.then(
        () => {
          sessionSettled = true
        },
        () => {
          sessionSettled = true
        },
      )
      await waitForScheduling()
      expect(sessionSettled).toBe(false)

      await banFirst.query('COMMIT')
      banFirstOpen = false
      await expectBanDenial(blockedSession, [banFirstUserId, 'ban won the race'])
      await sessionSecond.query('ROLLBACK')
      sessionSecondOpen = false
    } finally {
      if (sessionSecondOpen) await sessionSecond.query('ROLLBACK').catch(() => undefined)
      if (banFirstOpen) await banFirst.query('ROLLBACK').catch(() => undefined)
      sessionSecond.release()
      banFirst.release()
    }

    const sessionFirstUserId = 'session-first-race-user'
    await insertUser(migrationPool, sessionFirstUserId)
    const sessionFirst = await migrationPool.connect()
    const banSecond = await migrationPool.connect()
    let sessionFirstOpen = false
    let banSecondOpen = false
    try {
      await sessionFirst.query('BEGIN')
      sessionFirstOpen = true
      await sessionFirst.query(
        `INSERT INTO "session" (id, expires_at, token, updated_at, user_id)
         VALUES ('session-first-session', clock_timestamp() + interval '1 day',
                 'session-first-token', clock_timestamp(), $1)`,
        [sessionFirstUserId],
      )

      await banSecond.query('BEGIN')
      banSecondOpen = true
      const banSecondEvent = await banSecond.query<{ readonly id: string }>(
        `INSERT INTO admin_user_ban_history
           (subject_user_id, actor_user_id, action, reason, ban_started_at)
         VALUES ($1, 'ban-actor', 'ban', 'session won the race', clock_timestamp())
         RETURNING id::text`,
        [sessionFirstUserId],
      )
      const blockedProjection = projectEvent(banSecond, banSecondEvent.rows[0]!.id)
      let projectionSettled = false
      void blockedProjection.then(
        () => {
          projectionSettled = true
        },
        () => {
          projectionSettled = true
        },
      )
      await waitForScheduling()
      expect(projectionSettled).toBe(false)

      await sessionFirst.query('COMMIT')
      sessionFirstOpen = false
      await blockedProjection
      await banSecond.query(`DELETE FROM "session" WHERE user_id = $1`, [sessionFirstUserId])
      await banSecond.query('COMMIT')
      banSecondOpen = false
    } finally {
      if (banSecondOpen) await banSecond.query('ROLLBACK').catch(() => undefined)
      if (sessionFirstOpen) await sessionFirst.query('ROLLBACK').catch(() => undefined)
      banSecond.release()
      sessionFirst.release()
    }

    const survivingRaceSessions = await migrationPool.query(
      `SELECT id FROM "session" WHERE user_id IN ($1, $2) ORDER BY id`,
      [banFirstUserId, sessionFirstUserId],
    )
    expect(survivingRaceSessions.rows).toEqual([])
  })
})