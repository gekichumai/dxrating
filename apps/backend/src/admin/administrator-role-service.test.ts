import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { onError } from '@orpc/server'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldCaptureSentryError } from '../lib/functions/sentry.js'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'
import { AdminAuthorizationFailure, type AdminAuthorizationContext } from './authorization.js'
import {
  AdministratorRoleServiceFailure,
  createPostgresAdministratorRoleService,
  type AdministratorRoleService,
} from './administrator-role-service.js'
import { createPostgresAdministratorRoleStore } from './administrator-role-store.js'
import type { PersistedUserRole } from './role-policy.js'
import { createAdminRouter } from './router.js'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'

const ALLOWLIST_EFFECTIVE_AT = '2000-01-01T00:00:00.000Z'

const authentication = (actorUserId: string, actorRole: PersistedUserRole): AdminAuthorizationContext => ({
  authentication: {
    status: 'authenticated',
    authorizationUser: {
      id: actorUserId,
      role: actorRole,
      adminAuthorizationNotBefore: new Date(ALLOWLIST_EFFECTIVE_AT),
    },
    principal: {
      userId: actorUserId,
      effectiveRole: actorRole === 'admin' ? 'admin' : 'super_admin',
      capabilities: {
        canModerateUsers: true,
        canModerateAdministrators: actorRole !== 'admin',
        canManageAdministrators: actorRole !== 'admin',
      },
    },
    session: { id: `${actorUserId}-session`, authorizationIssuedAt: new Date() },
    assurance: { freshLoginSatisfied: true, recentPrimaryAuthSatisfied: true },
  },
})

const insertActor = async (
  database: pg.Pool,
  {
    id = 'super-actor',
    role = 'user',
    recent = true,
  }: { id?: string; role?: PersistedUserRole; recent?: boolean } = {},
) => {
  await database.query(
    `
      INSERT INTO "user" (id, name, email, role, admin_authorization_not_before)
      VALUES ($1, 'Role Actor', $2, $3::user_role, $4::timestamptz)
    `,
    [id, `${id}@example.test`, role, ALLOWLIST_EFFECTIVE_AT],
  )
  await database.query(
    `
      INSERT INTO session (
        id,
        expires_at,
        token,
        admin_authorization_issued_at,
        updated_at,
        user_id
      )
      VALUES ($1, clock_timestamp() + interval '1 hour', $2, clock_timestamp(), clock_timestamp(), $3)
    `,
    [`${id}-session`, `${id}-token`, id],
  )
  if (recent) {
    await database.query(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        INSERT INTO admin_primary_auth_windows (session_id, user_id, method, completed_at, expires_at)
        SELECT $1, $2, 'password', now, now + interval '10 minutes'
        FROM auth_clock
      `,
      [`${id}-session`, id],
    )
  }
}

const insertTarget = async (
  database: pg.Pool,
  {
    id = 'target-user',
    role = 'user',
    emailVerified = false,
  }: { id?: string; role?: PersistedUserRole; emailVerified?: boolean } = {},
) => {
  await database.query(
    `
      INSERT INTO "user" (id, name, email, email_verified, role)
      VALUES ($1, $2, $3, $4, $5::user_role)
    `,
    [id, `Target ${id}`, `${id}@example.test`, emailVerified, role],
  )
}

const createService = (
  database: pg.Pool,
  configuredSuperAdministrators: readonly string[] = ['super-actor'],
): AdministratorRoleService =>
  createPostgresAdministratorRoleService({
    store: createPostgresAdministratorRoleStore(database),
    superAdministrators: parseSuperAdministratorAllowlist(
      JSON.stringify(configuredSuperAdministrators),
      ALLOWLIST_EFFECTIVE_AT,
    ),
  })

const roleState = async (database: pg.Pool, userId = 'target-user') => {
  const result = await database.query<{
    readonly role: PersistedUserRole
    readonly admin_authorization_not_before: Date
  }>(`SELECT role::text, admin_authorization_not_before FROM "user" WHERE id = $1`, [userId])
  return result.rows[0]
}

const historyCount = async (database: pg.Pool, subjectUserId = 'target-user') => {
  const result = await database.query<{ readonly count: number }>(
    `SELECT count(*)::integer AS count FROM admin_role_change_history WHERE subject_user_id = $1`,
    [subjectUserId],
  )
  return result.rows[0]?.count ?? 0
}

const establishActiveBan = async (database: pg.Pool, reason: string): Promise<void> => {
  await database.query(
    `WITH established_ban AS (
       INSERT INTO admin_user_ban_history (
         subject_user_id,
         actor_user_id,
         previous_event_id,
         action,
         reason,
         ban_started_at,
         expires_at
       )
       VALUES ('target-user', 'super-actor', NULL, 'ban', $1, clock_timestamp(), NULL)
       RETURNING id, subject_user_id, actor_user_id, action, reason, ban_started_at, expires_at
     )
     INSERT INTO admin_user_ban_state (
       subject_user_id,
       established_action,
       ban_started_at,
       ban_expires_at,
       ban_reason,
       actor_user_id,
       established_by_event_id
     )
     SELECT subject_user_id, action, ban_started_at, expires_at, reason, actor_user_id, id
     FROM established_ban`,
    [reason],
  )
}

const waitForBlockedQuery = async (database: pg.Pool, marker: string): Promise<void> => {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const result = await database.query<{ readonly blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND pid <> pg_backend_pid()
           AND state = 'active'
           AND wait_event_type = 'Lock'
           AND position($1 in query) > 0
       ) AS blocked`,
      [marker],
    )
    if (result.rows[0]?.blocked) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for blocked PostgreSQL query: ${marker}`)
}

describe('administrator role service', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })

  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(cleanDatabase)

  it('returns a deduplicated roster of database and deployment administrators using approved fields only', async () => {
    await database.query(
      `
        INSERT INTO "user" (id, name, email, email_verified, role)
        VALUES
          ('database-admin', 'Database Admin', 'database-admin@example.test', false, 'admin'),
          ('deployment-admin', 'Deployment Admin', 'deployment-admin@example.test', true, 'user'),
          ('both-admin', 'Both Admin', 'both-admin@example.test', true, 'admin'),
          ('ordinary-user', 'Ordinary User', 'ordinary-user@example.test', true, 'user')
      `,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, ip_address, user_agent, user_id)
        VALUES (
          'secret-session',
          clock_timestamp() + interval '1 hour',
          'secret-session-token',
          clock_timestamp(),
          '203.0.113.42',
          'secret-user-agent',
          'database-admin'
        )
      `,
    )
    await database.query(
      `
        INSERT INTO account (
          id,
          account_id,
          provider_id,
          user_id,
          access_token,
          refresh_token,
          updated_at
        )
        VALUES (
          'secret-account',
          'secret-provider-subject',
          'google',
          'database-admin',
          'secret-access-token',
          'secret-refresh-token',
          clock_timestamp()
        )
      `,
    )
    await database.query(`INSERT INTO profiles (id, display_name) VALUES ('database-admin', 'Preferred Profile Name')`)

    const service = createService(database, ['missing-configured-id', 'deployment-admin', 'both-admin'])
    const roster = await service.listAdministrators()

    expect(roster).toEqual({
      items: [
        {
          userId: 'both-admin',
          displayName: 'Both Admin',
          email: 'both-admin@example.test',
          emailVerified: true,
          effectiveRole: 'super_admin',
          roleSource: 'deployment',
          accountStatus: { status: 'active' },
        },
        {
          userId: 'database-admin',
          displayName: 'Preferred Profile Name',
          email: 'database-admin@example.test',
          emailVerified: false,
          effectiveRole: 'admin',
          roleSource: 'database',
          accountStatus: { status: 'active' },
        },
        {
          userId: 'deployment-admin',
          displayName: 'Deployment Admin',
          email: 'deployment-admin@example.test',
          emailVerified: true,
          effectiveRole: 'super_admin',
          roleSource: 'deployment',
          accountStatus: { status: 'active' },
        },
      ],
    })
    const serialized = JSON.stringify(roster)
    for (const forbiddenValue of [
      'missing-configured-id',
      'secret-session',
      'secret-session-token',
      'secret-access-token',
      'secret-refresh-token',
      'secret-provider-subject',
      '203.0.113.42',
      'secret-user-agent',
    ]) {
      expect(serialized).not.toContain(forbiddenValue)
    }
  })

  it.each([false, true])('grants an existing account regardless of email verification (%s)', async (emailVerified) => {
    await insertActor(database)
    await insertTarget(database, { emailVerified })
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES (
          'target-pre-grant-session',
          clock_timestamp() + interval '1 hour',
          'target-pre-grant-token',
          clock_timestamp(),
          'target-user'
        )
      `,
    )
    const before = (await roleState(database))!.admin_authorization_not_before

    const result = await createService(database).grantAdministrator({
      context: authentication('super-actor', 'user'),
      targetUserId: 'target-user',
      reason: '  Needed for regional moderation  ',
    })

    expect(result).toMatchObject({
      change: {
        id: expect.stringMatching(/^[1-9][0-9]*$/),
        subjectUserId: 'target-user',
        actorUserId: 'super-actor',
        previousRole: 'user',
        newRole: 'admin',
        reason: 'Needed for regional moderation',
        changedAt: expect.stringMatching(/Z$/),
      },
    })
    const after = await roleState(database)
    expect(after?.role).toBe('admin')
    expect(after!.admin_authorization_not_before.getTime()).toBeGreaterThanOrEqual(before.getTime())

    const sessions = await database.query<{ readonly stale: boolean }>(
      `
        SELECT s.admin_authorization_issued_at <= u.admin_authorization_not_before AS stale
        FROM session s
        INNER JOIN "user" u ON u.id = s.user_id
        WHERE s.id = 'target-pre-grant-session'
      `,
    )
    expect(sessions.rows).toEqual([{ stale: true }])
    expect(await historyCount(database)).toBe(1)
  })

  it('projects an active-ban grant race as a private conflict and keeps it out of error telemetry', async () => {
    await insertActor(database)
    await insertTarget(database)
    const privateBanReason = 'Private moderation evidence must never leave the service'
    const privateGrantReason = 'Private staffing rationale must never enter telemetry'
    await establishActiveBan(database, privateBanReason)

    const captureException = vi.fn()
    const recordAuthorizationResult = vi.fn()
    const handler = new OpenAPIHandler(
      createAdminRouter({
        administratorRoles: createService(database),
      }),
      {
        clientInterceptors: [
          onError((error) => {
            if (shouldCaptureSentryError(error)) captureException(error)
          }),
        ],
      },
    )
    const { response } = await handler.handle(
      new Request('http://localhost/administrators/target-user/grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: privateGrantReason }),
      }),
      {
        context: {
          ...authentication('super-actor', 'user'),
          requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
          recordAuthorizationResult,
        },
      },
    )

    expect(response?.status).toBe(409)
    const body = await response?.json()
    expect(body).toMatchObject({
      defined: true,
      code: 'CONFLICT',
      data: { requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f' },
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('target-user')
    expect(serialized).not.toContain(privateBanReason)
    expect(serialized).not.toContain(privateGrantReason)
    expect(recordAuthorizationResult).toHaveBeenCalledWith('grantAdministrator', 'CONFLICT')
    expect(captureException).not.toHaveBeenCalled()
    await expect(roleState(database)).resolves.toMatchObject({ role: 'user' })
    expect(await historyCount(database)).toBe(0)
  })

  it('revokes an administrator and atomically removes every session-bound proof', async () => {
    await insertActor(database)
    await insertTarget(database, { role: 'admin' })
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES
          ('target-session-a', clock_timestamp() + interval '1 hour', 'target-token-a', clock_timestamp(), 'target-user'),
          ('target-session-b', clock_timestamp() + interval '1 hour', 'target-token-b', clock_timestamp(), 'target-user')
      `,
    )
    await database.query(
      `
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('target-google-account', 'target-google-subject', 'google', 'target-user', clock_timestamp())
      `,
    )
    await database.query(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        INSERT INTO admin_primary_auth_windows (session_id, user_id, method, completed_at, expires_at)
        SELECT 'target-session-a', 'target-user', 'google', now, now + interval '10 minutes'
        FROM auth_clock
      `,
    )
    await database.query(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        INSERT INTO admin_primary_auth_oauth_attempts (
          state_digest,
          session_id,
          user_id,
          account_id,
          provider,
          provider_account_id,
          code_verifier,
          nonce,
          redirect_uri,
          created_at,
          expires_at
        )
        SELECT
          repeat('a', 64),
          'target-session-b',
          'target-user',
          'target-google-account',
          'google',
          'target-google-subject',
          repeat('V', 64),
          'target-nonce',
          'http://localhost:3000/api/admin/primary-auth/oauth/callback/google',
          now,
          now + interval '10 minutes'
        FROM auth_clock
      `,
    )
    await database.query(
      `
        INSERT INTO admin_primary_auth_password_rate_limits (
          user_id,
          window_started_at,
          failure_count,
          updated_at
        )
        VALUES ('target-user', clock_timestamp(), 2, clock_timestamp())
      `,
    )

    const result = await createService(database).revokeAdministrator({
      context: authentication('super-actor', 'user'),
      targetUserId: 'target-user',
      reason: 'Access is no longer required',
    })

    expect(result.change).toMatchObject({
      previousRole: 'admin',
      newRole: 'user',
      reason: 'Access is no longer required',
    })
    const remaining = await database.query<{
      readonly role: PersistedUserRole
      readonly sessions: number
      readonly windows: number
      readonly attempts: number
      readonly rate_limits: number
    }>(
      `
        SELECT
          u.role::text AS role,
          (SELECT count(*)::integer FROM session WHERE user_id = u.id) AS sessions,
          (SELECT count(*)::integer FROM admin_primary_auth_windows WHERE user_id = u.id) AS windows,
          (SELECT count(*)::integer FROM admin_primary_auth_oauth_attempts WHERE user_id = u.id) AS attempts,
          (SELECT count(*)::integer FROM admin_primary_auth_password_rate_limits WHERE user_id = u.id) AS rate_limits
        FROM "user" u
        WHERE u.id = 'target-user'
      `,
    )
    expect(remaining.rows).toEqual([{ role: 'user', sessions: 0, windows: 0, attempts: 0, rate_limits: 1 }])
    expect(await historyCount(database)).toBe(1)
  })

  it('retries an atomic demotion when a concurrent target-session update wins the tuple race', async () => {
    await insertActor(database)
    await insertTarget(database, { role: 'admin' })
    await database.query(
      `INSERT INTO session (id, expires_at, token, updated_at, user_id)
       VALUES ('target-session', clock_timestamp() + interval '1 hour',
               'target-token', clock_timestamp(), 'target-user')`,
    )
    await database.query(
      `CREATE FUNCTION admin_role_retry_pause() RETURNS trigger
       LANGUAGE plpgsql AS $function$
       BEGIN
         IF OLD.role = 'admin' AND NEW.role = 'user' AND NEW.id = 'target-user' THEN
           PERFORM pg_advisory_xact_lock(3150019);
         END IF;
         RETURN NEW;
       END
       $function$`,
    )
    await database.query(
      `CREATE TRIGGER admin_role_zz_retry_pause
       AFTER UPDATE OF role ON "user"
       FOR EACH ROW EXECUTE FUNCTION admin_role_retry_pause()`,
    )

    const pause = await database.connect()
    let pauseHeld = false
    let demotion: ReturnType<AdministratorRoleService['revokeAdministrator']> | undefined
    let sessionUpdate: Promise<pg.QueryResult> | undefined
    try {
      await pause.query('SELECT pg_advisory_lock(3150019)')
      pauseHeld = true
      demotion = createService(database).revokeAdministrator({
        context: authentication('super-actor', 'user'),
        targetUserId: 'target-user',
        reason: 'Retried tuple-race demotion',
      })
      await waitForBlockedQuery(database, 'administrator-role-store:apply-role-change')

      sessionUpdate = database.query(
        `/* administrator-role-service:test-session-update */
         UPDATE session SET updated_at = clock_timestamp() WHERE id = 'target-session'`,
      )
      await waitForBlockedQuery(database, 'administrator-role-service:test-session-update')

      await pause.query('SELECT pg_advisory_unlock(3150019)')
      pauseHeld = false
      await expect(sessionUpdate).resolves.toMatchObject({ rowCount: 1 })
      await expect(demotion).resolves.toMatchObject({
        change: { previousRole: 'admin', newRole: 'user', reason: 'Retried tuple-race demotion' },
      })
      await expect(roleState(database)).resolves.toMatchObject({ role: 'user' })
      const sessions = await database.query(`SELECT id FROM session WHERE user_id = 'target-user'`)
      expect(sessions.rows).toEqual([])
      expect(await historyCount(database)).toBe(1)
    } finally {
      if (pauseHeld) await pause.query('SELECT pg_advisory_unlock(3150019)').catch(() => undefined)
      pause.release()
      await Promise.allSettled([demotion, sessionUpdate].filter((promise) => promise !== undefined))
      await database.query(`DROP TRIGGER IF EXISTS admin_role_zz_retry_pause ON "user"`)
      await database.query(`DROP FUNCTION IF EXISTS admin_role_retry_pause()`)
    }
  })

  it.each([
    { operation: 'grant' as const, currentRole: 'admin' as const },
    { operation: 'revoke' as const, currentRole: 'user' as const },
  ])('rejects a $operation no-op as a conflict without history', async ({ operation, currentRole }) => {
    await insertActor(database)
    await insertTarget(database, { role: currentRole })
    const service = createService(database)

    const result =
      operation === 'grant'
        ? service.grantAdministrator({
            context: authentication('super-actor', 'user'),
            targetUserId: 'target-user',
            reason: 'Duplicate grant',
          })
        : service.revokeAdministrator({
            context: authentication('super-actor', 'user'),
            targetUserId: 'target-user',
            reason: 'Duplicate revoke',
          })

    await expect(result).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await roleState(database))?.role).toBe(currentRole)
    expect(await historyCount(database)).toBe(0)
  })

  it.each(['', '   ', 'x'.repeat(1_001)])(
    'rejects an invalid reason without exposing or persisting it',
    async (reason) => {
      await insertActor(database)
      await insertTarget(database)

      let thrown: unknown
      try {
        await createService(database).grantAdministrator({
          context: authentication('super-actor', 'user'),
          targetUserId: 'target-user',
          reason,
        })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(AdministratorRoleServiceFailure)
      expect(thrown).toMatchObject({ code: 'VALIDATION_FAILED' })
      expect(String(thrown)).toBe('AdministratorRoleServiceFailure: Administrator role operation failed')
      if (reason.length > 0) expect(String(thrown)).not.toContain(reason)
      expect((await roleState(database))?.role).toBe('user')
      expect(await historyCount(database)).toBe(0)
    },
  )

  it('rechecks recent authentication and current super-administrator authority in the transaction', async () => {
    await insertActor(database)
    await insertTarget(database)
    await database.query(
      `
        WITH auth_clock AS (SELECT clock_timestamp() AS now)
        UPDATE admin_primary_auth_windows
        SET
          completed_at = auth_clock.now - interval '11 minutes',
          expires_at = auth_clock.now - interval '1 minute'
        FROM auth_clock
        WHERE session_id = 'super-actor-session'
      `,
    )
    const service = createService(database)

    await expect(
      service.grantAdministrator({
        context: authentication('super-actor', 'user'),
        targetUserId: 'target-user',
        reason: 'Expired proof must not work',
      }),
    ).rejects.toMatchObject({ code: 'RECENT_AUTH_REQUIRED' })
    expect((await roleState(database))?.role).toBe('user')
    expect(await historyCount(database)).toBe(0)

    await cleanDatabase()
    await insertActor(database, { id: 'ordinary-admin', role: 'admin' })
    await insertTarget(database)
    await expect(
      createService(database, []).grantAdministrator({
        context: authentication('ordinary-admin', 'admin'),
        targetUserId: 'target-user',
        reason: 'Administrators cannot grant administrators',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await roleState(database))?.role).toBe('user')
    expect(await historyCount(database)).toBe(0)
  })

  it('rejects stale or missing actor sessions and missing target accounts with typed failures', async () => {
    await insertActor(database)
    await insertTarget(database)
    const service = createService(database)

    await database.query(
      `UPDATE "user" SET admin_authorization_not_before = clock_timestamp() + interval '1 second' WHERE id = 'super-actor'`,
    )
    await expect(
      service.grantAdministrator({
        context: authentication('super-actor', 'user'),
        targetUserId: 'target-user',
        reason: 'Stale authority',
      }),
    ).rejects.toMatchObject({ code: 'FRESH_LOGIN_REQUIRED' })

    await database.query(`DELETE FROM session WHERE id = 'super-actor-session'`)
    await expect(
      service.grantAdministrator({
        context: authentication('super-actor', 'user'),
        targetUserId: 'target-user',
        reason: 'Missing session',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })

    await cleanDatabase()
    await insertActor(database)
    await expect(
      createService(database).grantAdministrator({
        context: authentication('super-actor', 'user'),
        targetUserId: 'missing-target',
        reason: 'Missing target',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it.each(['user', 'admin'] as const)(
    'never mutates an effective super administrator with persisted %s role',
    async (persistedRole) => {
      await insertActor(database)
      await insertTarget(database, { id: 'configured-target', role: persistedRole })
      const service = createService(database, ['super-actor', 'configured-target'])
      const operation =
        persistedRole === 'user'
          ? service.grantAdministrator({
              context: authentication('super-actor', 'user'),
              targetUserId: 'configured-target',
              reason: 'Forbidden deployment target',
            })
          : service.revokeAdministrator({
              context: authentication('super-actor', 'user'),
              targetUserId: 'configured-target',
              reason: 'Forbidden deployment target',
            })

      await expect(operation).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect((await roleState(database, 'configured-target'))?.role).toBe(persistedRole)
      expect(await historyCount(database, 'configured-target')).toBe(0)
    },
  )

  it('serializes concurrent grants into one change and one typed conflict', async () => {
    await insertActor(database)
    await insertTarget(database)
    const service = createService(database)
    const request = {
      context: authentication('super-actor', 'user'),
      targetUserId: 'target-user',
      reason: 'Concurrent grant',
    }

    const results = await Promise.allSettled([service.grantAdministrator(request), service.grantAdministrator(request)])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'CONFLICT' } })
    expect((await roleState(database))?.role).toBe('admin')
    expect(await historyCount(database)).toBe(1)
  })

  it('rolls back the role, authorization floor, sessions, and history when history insertion fails', async () => {
    await insertActor(database)
    await insertTarget(database, { role: 'admin' })
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES (
          'rollback-target-session',
          clock_timestamp() + interval '1 hour',
          'rollback-target-token',
          clock_timestamp(),
          'target-user'
        )
      `,
    )
    const before = await roleState(database)
    await database.query(
      `
        CREATE FUNCTION admin_role_history_test_failure() RETURNS trigger
        LANGUAGE plpgsql AS $function$
        BEGIN
          RAISE EXCEPTION 'injected administrator role history failure';
        END
        $function$
      `,
    )
    await database.query(
      `
        CREATE TRIGGER admin_role_history_test_failure
        BEFORE INSERT ON admin_role_change_history
        FOR EACH ROW EXECUTE FUNCTION admin_role_history_test_failure()
      `,
    )

    try {
      await expect(
        createService(database).revokeAdministrator({
          context: authentication('super-actor', 'user'),
          targetUserId: 'target-user',
          reason: 'This transaction must roll back',
        }),
      ).rejects.toThrow('injected administrator role history failure')
    } finally {
      await database.query(`DROP TRIGGER IF EXISTS admin_role_history_test_failure ON admin_role_change_history`)
      await database.query(`DROP FUNCTION IF EXISTS admin_role_history_test_failure()`)
    }

    const after = await roleState(database)
    expect(after?.role).toBe('admin')
    expect(after?.admin_authorization_not_before).toEqual(before?.admin_authorization_not_before)
    const sessions = await database.query<{ readonly count: number }>(
      `SELECT count(*)::integer AS count FROM session WHERE id = 'rollback-target-session'`,
    )
    expect(sessions.rows).toEqual([{ count: 1 }])
    expect(await historyCount(database)).toBe(0)
  })

  it('returns subject-bound stable cursor pages without duplicates', async () => {
    await insertActor(database)
    await insertTarget(database)
    await insertTarget(database, { id: 'other-target' })
    const service = createService(database)

    for (let index = 0; index < 5; index += 1) {
      const input = {
        context: authentication('super-actor', 'user'),
        targetUserId: 'target-user',
        reason: `History reason ${index}`,
      }
      if (index % 2 === 0) await service.grantAdministrator(input)
      else await service.revokeAdministrator(input)
    }

    // The keyset cursor must use its ID tie-breaker when several rows share
    // the exact database timestamp. Test setup runs as the owner so it can
    // briefly bypass the append-only trigger to construct that boundary.
    await database.query(`ALTER TABLE admin_role_change_history DISABLE TRIGGER admin_role_change_history_guard`)
    try {
      await database.query(
        `
          UPDATE admin_role_change_history
          SET created_at = '2026-08-24T08:00:00.123Z'::timestamptz
          WHERE subject_user_id = 'target-user'
        `,
      )
    } finally {
      await database.query(`ALTER TABLE admin_role_change_history ENABLE TRIGGER admin_role_change_history_guard`)
    }

    const first = await service.listRoleHistory({ subjectUserId: 'target-user', limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toEqual(expect.any(String))
    const second = await service.listRoleHistory({
      subjectUserId: 'target-user',
      cursor: first.nextCursor!,
      limit: 2,
    })
    expect(second.items).toHaveLength(2)
    expect(second.nextCursor).toEqual(expect.any(String))
    const third = await service.listRoleHistory({
      subjectUserId: 'target-user',
      cursor: second.nextCursor!,
      limit: 2,
    })
    expect(third.items).toHaveLength(1)
    expect(third.nextCursor).toBeNull()

    const items = [...first.items, ...second.items, ...third.items]
    expect(new Set(items.map((item) => item.id)).size).toBe(5)
    expect(items.map((item) => BigInt(item.id))).toEqual(
      [...items.map((item) => BigInt(item.id))].sort((left, right) => (left > right ? -1 : left < right ? 1 : 0)),
    )
    expect(items.map((item) => item.reason)).toEqual([
      'History reason 4',
      'History reason 3',
      'History reason 2',
      'History reason 1',
      'History reason 0',
    ])
    await expect(
      service.listRoleHistory({ subjectUserId: 'other-target', cursor: first.nextCursor!, limit: 2 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      service.listRoleHistory({ subjectUserId: 'target-user', cursor: 'not a cursor', limit: 2 }),
    ).rejects.toBeInstanceOf(AdministratorRoleServiceFailure)
    const outOfRangeCursor = Buffer.from(
      JSON.stringify({
        version: 1,
        subjectUserId: 'target-user',
        changedAt: '2026-08-24T08:00:00.123Z',
        id: '9223372036854775808',
      }),
    ).toString('base64url')
    await expect(
      service.listRoleHistory({ subjectUserId: 'target-user', cursor: outOfRangeCursor, limit: 2 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(service.listRoleHistory({ subjectUserId: ' target-user ', limit: 2 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
    await expect(service.listRoleHistory({ subjectUserId: 'target-user', limit: 101 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
    await expect(service.listRoleHistory({ subjectUserId: 'target-user', limit: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })

    await expect(service.listRoleHistory({ subjectUserId: 'other-target', limit: 2 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    })
  })

  it('uses typed authorization failures rather than treating them as role conflicts', async () => {
    await insertActor(database)
    await insertTarget(database)
    await database.query(`DELETE FROM session WHERE id = 'super-actor-session'`)

    await expect(
      createService(database).grantAdministrator({
        context: authentication('super-actor', 'user'),
        targetUserId: 'target-user',
        reason: 'No session',
      }),
    ).rejects.toBeInstanceOf(AdminAuthorizationFailure)
  })
})