import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'
import { AdminAuthorizationFailure, type AdminAuthorizationContext } from './authorization.js'
import { createPostgresAdministratorRoleService } from './administrator-role-service.js'
import { createPostgresAdministratorRoleStore } from './administrator-role-store.js'
import type { PersistedUserRole } from './role-policy.js'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import {
  createPostgresUserBanService,
  UserBanServiceFailure,
  type UserBanTransitionResult,
  type UserBanService,
} from './user-ban-service.js'
import { createPostgresUserBanStore } from './user-ban-store.js'

const ALLOWLIST_EFFECTIVE_AT = '2000-01-01T00:00:00.000Z'
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

const authentication = (
  actorUserId: string,
  persistedRole: PersistedUserRole,
  effectiveRole: 'admin' | 'super_admin',
): AdminAuthorizationContext => ({
  authentication: {
    status: 'authenticated',
    authorizationUser: {
      id: actorUserId,
      role: persistedRole,
      adminAuthorizationNotBefore: new Date(ALLOWLIST_EFFECTIVE_AT),
    },
    principal: {
      userId: actorUserId,
      effectiveRole,
      capabilities: {
        canModerateUsers: true,
        canModerateAdministrators: effectiveRole === 'super_admin',
        canManageAdministrators: effectiveRole === 'super_admin',
      },
    },
    session: { id: `${actorUserId}-session`, authorizationIssuedAt: new Date() },
    assurance: { freshLoginSatisfied: true, recentPrimaryAuthSatisfied: true },
  },
})

const insertActor = async (
  database: pg.Pool,
  { id, role, recent = true }: { id: string; role: PersistedUserRole; recent?: boolean },
) => {
  await database.query(
    `
      INSERT INTO "user" (id, name, email, role, admin_authorization_not_before)
      VALUES ($1, $2, $3, $4::user_role, $5::timestamptz)
    `,
    [id, `Actor ${id}`, `${id}@example.test`, role, ALLOWLIST_EFFECTIVE_AT],
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
  { id = 'target-user', role = 'user' }: { id?: string; role?: PersistedUserRole } = {},
) => {
  await database.query(
    `
      INSERT INTO "user" (id, name, email, role)
      VALUES ($1, $2, $3, $4::user_role)
    `,
    [id, `Target ${id}`, `${id}@example.test`, role],
  )
}

const createService = (database: pg.Pool, superAdministratorIds: readonly string[] = ['super-actor']): UserBanService =>
  createPostgresUserBanService({
    store: createPostgresUserBanStore(database),
    superAdministrators: parseSuperAdministratorAllowlist(
      JSON.stringify(superAdministratorIds),
      ALLOWLIST_EFFECTIVE_AT,
    ),
  })

const futureDatabaseTime = async (database: pg.Pool, interval = '1 hour'): Promise<Date> => {
  const result = await database.query<{ readonly expires_at: Date }>(
    `SELECT clock_timestamp() + $1::interval AS expires_at`,
    [interval],
  )
  return result.rows[0]!.expires_at
}

const historyRows = async (database: pg.Pool, subjectUserId = 'target-user') => {
  const result = await database.query<{
    readonly id: string
    readonly previous_event_id: string | null
    readonly action: string
    readonly reason: string | null
    readonly ban_started_at: Date | null
    readonly expires_at: Date | null
    readonly request_correlation_id: string | null
  }>(
    `
      SELECT
        id::text,
        previous_event_id::text,
        action,
        reason,
        ban_started_at,
        expires_at,
        request_correlation_id::text
      FROM admin_user_ban_history
      WHERE subject_user_id = $1
      ORDER BY id
    `,
    [subjectUserId],
  )
  return result.rows
}

const sessionCount = async (database: pg.Pool, userId = 'target-user') => {
  const result = await database.query<{ readonly count: number }>(
    `SELECT count(*)::integer AS count FROM session WHERE user_id = $1`,
    [userId],
  )
  return result.rows[0]!.count
}

const expireProjectedBan = async (database: pg.Pool, subjectUserId = 'target-user') => {
  await database.query(`ALTER TABLE admin_user_ban_history DISABLE TRIGGER admin_user_ban_history_guard`)
  await database.query(`ALTER TABLE admin_user_ban_state DISABLE TRIGGER admin_user_ban_state_guard`)
  try {
    await database.query(
      `
        WITH expiration AS (SELECT clock_timestamp() - interval '1 millisecond' AS expires_at)
        UPDATE admin_user_ban_history history
        SET expires_at = expiration.expires_at
        FROM expiration
        WHERE history.id = (
          SELECT established_by_event_id
          FROM admin_user_ban_state
          WHERE subject_user_id = $1
        )
      `,
      [subjectUserId],
    )
    await database.query(
      `
        WITH expiration AS (SELECT clock_timestamp() - interval '1 millisecond' AS expires_at)
        UPDATE admin_user_ban_state
        SET ban_expires_at = expiration.expires_at
        FROM expiration
        WHERE subject_user_id = $1
      `,
      [subjectUserId],
    )
  } finally {
    await database.query(`ALTER TABLE admin_user_ban_state ENABLE TRIGGER admin_user_ban_state_guard`)
    await database.query(`ALTER TABLE admin_user_ban_history ENABLE TRIGGER admin_user_ban_history_guard`)
  }
}

describe('user-ban service', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })

  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(cleanDatabase)

  it('creates temporary and permanent bans with database-evaluated current state', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    const service = createService(database, [])
    const expiresAt = await futureDatabaseTime(database)

    const temporary = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'temporary',
      expiresAt,
      reason: '  Repeated harassment  ',
      requestCorrelationId: REQUEST_ID.toUpperCase(),
    })

    expect(temporary).toMatchObject({
      event: {
        id: expect.stringMatching(/^[1-9][0-9]*$/),
        subjectUserId: 'target-user',
        actorUserId: 'admin-actor',
        previousEventId: null,
        action: 'ban',
        reason: 'Repeated harassment',
        expiresAt,
        requestCorrelationId: REQUEST_ID,
      },
      state: {
        subjectUserId: 'target-user',
        establishedAction: 'ban',
        status: 'temporarily_banned',
        active: true,
        banReason: 'Repeated harassment',
        banExpiresAt: expiresAt,
      },
      revokedSessionCount: 0,
    })
    expect(temporary.state.stateVersion).toBe(temporary.event.id)
    expect(temporary.state.banStartedAt).toEqual(temporary.event.banStartedAt)
    expect(temporary.event.createdAt.getTime()).toBeLessThan(expiresAt.getTime())

    await insertTarget(database, { id: 'permanent-target' })
    const permanent = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'permanent-target',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Permanent safety restriction',
    })
    expect(permanent.state).toMatchObject({
      status: 'permanently_banned',
      active: true,
      banExpiresAt: null,
    })
    expect(permanent.event.expiresAt).toBeNull()
  })

  it('revokes pre-ban sessions and chains a replacement while preserving the uninterrupted start', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    const service = createService(database, [])
    const firstExpiry = await futureDatabaseTime(database, '1 hour')
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
          repeat('b', 64),
          'target-session-b',
          'target-user',
          'target-google-account',
          'google',
          'target-google-subject',
          repeat('W', 64),
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
    const first = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'temporary',
      expiresAt: firstExpiry,
      reason: 'Initial restriction',
    })
    expect(first.revokedSessionCount).toBe(2)
    expect(await sessionCount(database)).toBe(0)

    const replacementExpiry = await futureDatabaseTime(database, '2 hours')

    const replacement = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: first.event.id,
      kind: 'temporary',
      expiresAt: replacementExpiry,
      reason: 'Extended after review',
    })

    expect(replacement).toMatchObject({
      event: {
        previousEventId: first.event.id,
        action: 'ban',
        reason: 'Extended after review',
        banStartedAt: first.event.banStartedAt,
        expiresAt: replacementExpiry,
      },
      state: {
        stateVersion: replacement.event.id,
        status: 'temporarily_banned',
        banStartedAt: first.event.banStartedAt,
      },
      revokedSessionCount: 0,
    })
    expect(await sessionCount(database)).toBe(0)
    const sessionProofs = await database.query<{
      readonly windows: number
      readonly attempts: number
      readonly rate_limits: number
    }>(
      `
        SELECT
          (SELECT count(*)::integer FROM admin_primary_auth_windows WHERE user_id = 'target-user') AS windows,
          (SELECT count(*)::integer FROM admin_primary_auth_oauth_attempts WHERE user_id = 'target-user') AS attempts,
          (SELECT count(*)::integer FROM admin_primary_auth_password_rate_limits WHERE user_id = 'target-user') AS rate_limits
      `,
    )
    expect(sessionProofs.rows).toEqual([{ windows: 0, attempts: 0, rate_limits: 1 }])
    expect(await historyRows(database)).toHaveLength(2)

    await expect(
      service.banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: replacement.event.id,
        kind: 'temporary',
        expiresAt: replacementExpiry,
        reason: '  Extended after review  ',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await historyRows(database)).toHaveLength(2)
  })

  it('keeps expired state inactive, conflicts on unban, and starts a fresh interval when re-banned', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    const service = createService(database, [])
    const first = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'temporary',
      expiresAt: await futureDatabaseTime(database),
      reason: 'Temporary restriction',
    })
    await expireProjectedBan(database)

    const expired = await service.getCurrentState('target-user')
    expect(expired).toMatchObject({
      stateVersion: first.event.id,
      establishedAction: 'ban',
      status: 'expired',
      active: false,
    })
    await expect(
      service.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: first.event.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const second = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: first.event.id,
      kind: 'permanent',
      reason: 'New incident after expiry',
    })
    expect(second.event.previousEventId).toBe(first.event.id)
    expect(second.event.banStartedAt!.getTime()).toBeGreaterThan(first.event.banStartedAt!.getTime())
    expect(second.state.status).toBe('permanently_banned')
  })

  it('records an explicit unban without a reason and retains its version to prevent ABA', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    const service = createService(database, [])
    const ban = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Safety review',
    })

    const unban = await service.unbanUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: ban.event.id,
    })

    expect(unban).toMatchObject({
      event: {
        previousEventId: ban.event.id,
        action: 'unban',
        reason: null,
        banStartedAt: null,
        expiresAt: null,
      },
      state: {
        stateVersion: unban.event.id,
        establishedAction: 'unban',
        status: 'unbanned',
        active: false,
        banReason: null,
      },
      revokedSessionCount: 0,
    })
    await expect(
      service.banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: null,
        kind: 'permanent',
        reason: 'Stale null version',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      service.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: unban.event.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await historyRows(database)).toHaveLength(2)
  })

  it('requires strict bounded reasons and a temporary expiry later than database time', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    const service = createService(database, [])

    for (const reason of ['', '   ', 'x'.repeat(1_001)]) {
      await expect(
        service.banUser({
          context: authentication('admin-actor', 'admin', 'admin'),
          targetUserId: 'target-user',
          expectedStateVersion: null,
          kind: 'permanent',
          reason,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
    await expect(
      service.banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: null,
        kind: 'temporary',
        expiresAt: (await service.getCurrentState('target-user')).evaluatedAt,
        reason: 'Not future',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      service.banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: null,
        kind: 'temporary',
        expiresAt: new Date(Number.NaN),
        reason: 'Invalid timestamp',
      }),
    ).rejects.toBeInstanceOf(UserBanServiceFailure)
    await expect(
      service.banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: null,
        kind: 'temporary',
        expiresAt: await futureDatabaseTime(database, '365 days 1 hour'),
        reason: 'Outside the supported temporary-ban range',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(await historyRows(database)).toHaveLength(0)

    const ban = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Valid ban',
    })
    await expect(
      service.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: ban.event.id,
        reason: '   ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      service.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: ban.event.id,
        requestCorrelationId: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(await historyRows(database)).toHaveLength(1)
  })

  it('enforces the current administrator hierarchy and recent primary authentication under lock', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database, { id: 'ordinary-target' })
    await insertTarget(database, { id: 'administrator-target', role: 'admin' })
    const ordinaryService = createService(database, [])

    const ordinaryBan = await ordinaryService.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'ordinary-target',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Eligible ordinary user',
    })
    await expect(
      ordinaryService.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'ordinary-target',
        expectedStateVersion: ordinaryBan.event.id,
      }),
    ).resolves.toMatchObject({ state: { active: false } })
    await expect(
      ordinaryService.banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'administrator-target',
        expectedStateVersion: null,
        kind: 'permanent',
        reason: 'Ineligible administrator',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      ordinaryService.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'administrator-target',
        expectedStateVersion: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await cleanDatabase()
    await insertActor(database, { id: 'super-actor', role: 'user' })
    await insertTarget(database, { id: 'administrator-target', role: 'admin' })
    await insertTarget(database, { id: 'effective-super-target' })
    const superService = createService(database, ['super-actor', 'effective-super-target'])
    const administratorBan = await superService.banUser({
      context: authentication('super-actor', 'user', 'super_admin'),
      targetUserId: 'administrator-target',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Super-admin moderation',
    })
    await expect(
      superService.unbanUser({
        context: authentication('super-actor', 'user', 'super_admin'),
        targetUserId: 'administrator-target',
        expectedStateVersion: administratorBan.event.id,
      }),
    ).resolves.toMatchObject({ state: { active: false } })
    await expect(
      superService.banUser({
        context: authentication('super-actor', 'user', 'super_admin'),
        targetUserId: 'effective-super-target',
        expectedStateVersion: null,
        kind: 'permanent',
        reason: 'Forbidden effective super target',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      superService.unbanUser({
        context: authentication('super-actor', 'user', 'super_admin'),
        targetUserId: 'effective-super-target',
        expectedStateVersion: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await cleanDatabase()
    await insertActor(database, { id: 'admin-actor', role: 'admin', recent: false })
    await insertTarget(database)
    await expect(
      createService(database, []).banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: null,
        kind: 'permanent',
        reason: 'Missing recent proof',
      }),
    ).rejects.toMatchObject({ code: 'RECENT_AUTH_REQUIRED' })

    await cleanDatabase()
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    const recentService = createService(database, [])
    const activeBan = await recentService.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Requires recent auth to remove',
    })
    await database.query(`DELETE FROM admin_primary_auth_windows WHERE user_id = 'admin-actor'`)
    await expect(
      recentService.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: activeBan.event.id,
      }),
    ).rejects.toMatchObject({ code: 'RECENT_AUTH_REQUIRED' })
  })

  it('rejects stale actor sessions and stale state versions with typed failures', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    const service = createService(database, [])
    await expect(
      service.banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'missing-target',
        expectedStateVersion: null,
        kind: 'permanent',
        reason: 'Missing account',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await database.query(
      `UPDATE "user" SET admin_authorization_not_before = clock_timestamp() + interval '1 second' WHERE id = 'admin-actor'`,
    )
    await expect(
      service.banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: null,
        kind: 'permanent',
        reason: 'Stale authority',
      }),
    ).rejects.toMatchObject({ code: 'FRESH_LOGIN_REQUIRED' })

    await database.query(
      `UPDATE "user" SET admin_authorization_not_before = $1::timestamptz WHERE id = 'admin-actor'`,
      [ALLOWLIST_EFFECTIVE_AT],
    )
    const ban = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Current transition',
    })
    await expect(
      service.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: '9223372036854775807',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await historyRows(database)).map((row) => row.id)).toEqual([ban.event.id])

    await database.query(`DELETE FROM session WHERE id = 'admin-actor-session'`)
    await expect(
      service.unbanUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: ban.event.id,
      }),
    ).rejects.toBeInstanceOf(AdminAuthorizationFailure)
  })

  it('serializes concurrent transitions into one event and one deterministic conflict', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    const service = createService(database, [])
    const request = {
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'permanent' as const,
      reason: 'Concurrent ban',
    }

    const firstResults = await Promise.allSettled([service.banUser(request), service.banUser(request)])
    expect(firstResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(firstResults.find((result) => result.status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { code: 'CONFLICT' },
    })
    const firstEvent = (
      firstResults.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<UserBanService['banUser']>>
      >
    ).value.event

    const replacementResults = await Promise.allSettled([
      service.banUser({ ...request, expectedStateVersion: firstEvent.id, reason: 'Replacement A' }),
      service.banUser({ ...request, expectedStateVersion: firstEvent.id, reason: 'Replacement B' }),
    ])
    expect(replacementResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(replacementResults.find((result) => result.status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { code: 'CONFLICT' },
    })
    expect(await historyRows(database)).toHaveLength(2)
  })

  it('retries an atomic ban when a concurrent target-session update wins the tuple race', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    await database.query(
      `INSERT INTO session (id, expires_at, token, updated_at, user_id)
       VALUES ('target-session', clock_timestamp() + interval '1 hour',
               'target-token', clock_timestamp(), 'target-user')`,
    )
    const sessionUpdater = await database.connect()
    let ban: Promise<UserBanTransitionResult> | undefined
    try {
      await sessionUpdater.query('BEGIN')
      await sessionUpdater.query(`UPDATE session SET updated_at = clock_timestamp() WHERE id = 'target-session'`)

      ban = createService(database, []).banUser({
        context: authentication('admin-actor', 'admin', 'admin'),
        targetUserId: 'target-user',
        expectedStateVersion: null,
        kind: 'permanent',
        reason: 'Retried tuple-race ban',
      })
      await new Promise((resolve) => setTimeout(resolve, 45))
      await sessionUpdater.query('COMMIT')

      await expect(ban).resolves.toMatchObject({
        state: { active: true, banReason: 'Retried tuple-race ban' },
        revokedSessionCount: 1,
      })
      expect(await sessionCount(database)).toBe(0)
      expect(await historyRows(database)).toHaveLength(1)
    } finally {
      await sessionUpdater.query('ROLLBACK').catch(() => undefined)
      sessionUpdater.release()
      await Promise.allSettled([ban].filter((promise) => promise !== undefined))
    }
  })

  it('rolls back state, history, session revocation, and preserves authored content when insertion fails', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    await database.query(`INSERT INTO profiles (id, display_name) VALUES ('target-user', 'Retained profile')`)
    await database.query(
      `
        INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, content)
        VALUES ('target-user', 'song-id', 'dx', 'master', 'Retained comment')
      `,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES ('target-session', clock_timestamp() + interval '1 hour', 'target-token', clock_timestamp(), 'target-user')
      `,
    )
    await database.query(
      `
        CREATE FUNCTION admin_user_ban_test_failure() RETURNS trigger
        LANGUAGE plpgsql AS $function$
        BEGIN
          RAISE EXCEPTION 'injected user-ban history failure';
        END
        $function$
      `,
    )
    await database.query(
      `
        CREATE TRIGGER admin_user_ban_zz_test_failure
        BEFORE INSERT ON admin_user_ban_history
        FOR EACH ROW EXECUTE FUNCTION admin_user_ban_test_failure()
      `,
    )

    try {
      await expect(
        createService(database, []).banUser({
          context: authentication('admin-actor', 'admin', 'admin'),
          targetUserId: 'target-user',
          expectedStateVersion: null,
          kind: 'permanent',
          reason: 'Must roll back',
        }),
      ).rejects.toThrow('injected user-ban history failure')
    } finally {
      await database.query(`DROP TRIGGER IF EXISTS admin_user_ban_zz_test_failure ON admin_user_ban_history`)
      await database.query(`DROP FUNCTION IF EXISTS admin_user_ban_test_failure()`)
    }

    expect(await createService(database, []).getCurrentState('target-user')).toMatchObject({
      stateVersion: null,
      status: 'unbanned',
    })
    expect(await sessionCount(database)).toBe(1)
    expect(await historyRows(database)).toHaveLength(0)
    const content = await database.query<{
      readonly profiles: number
      readonly comments: number
    }>(
      `
        SELECT
          (SELECT count(*)::integer FROM profiles WHERE id = 'target-user') AS profiles,
          (SELECT count(*)::integer FROM comments WHERE created_by = 'target-user') AS comments
      `,
    )
    expect(content.rows).toEqual([{ profiles: 1, comments: 1 }])
  })

  it('preserves existing authored content byte-for-byte across a successful ban and unban', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    await database.query(`INSERT INTO profiles (id, display_name) VALUES ('target-user', 'Retained profile')`)
    await database.query(
      `
        INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, content)
        VALUES ('target-user', 'retained-song', 'dx', 'master', 'Retained comment bytes: åäö')
      `,
    )
    await database.query(
      `
        INSERT INTO song_aliases (song_id, name, created_by)
        VALUES ('retained-song', 'Retained alias bytes: 日本語', 'target-user')
      `,
    )
    await database.query(
      `
        INSERT INTO session (id, expires_at, token, updated_at, user_id)
        VALUES (
          'retained-content-session',
          clock_timestamp() + interval '1 hour',
          'retained-content-token',
          clock_timestamp(),
          'target-user'
        )
      `,
    )
    const readContent = async () =>
      database.query<{
        readonly display_name: string
        readonly comment_content: string
        readonly alias_name: string
      }>(
        `
          SELECT
            profile.display_name,
            comment.content AS comment_content,
            alias.name AS alias_name
          FROM profiles profile
          INNER JOIN comments comment ON comment.created_by = profile.id
          INNER JOIN song_aliases alias ON alias.created_by = profile.id
          WHERE profile.id = 'target-user'
        `,
      )
    const before = (await readContent()).rows
    const service = createService(database, [])
    expect(await sessionCount(database)).toBe(1)

    const ban = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Content must remain intact',
    })
    expect((await readContent()).rows).toEqual(before)
    expect(await sessionCount(database)).toBe(0)

    const unban = await service.unbanUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: ban.event.id,
      reason: '  Cleared after review  ',
    })
    expect(unban.event.reason).toBe('Cleared after review')
    expect((await readContent()).rows).toEqual(before)
    expect(await sessionCount(database)).toBe(0)
  })

  it('maps expiry crossings at the database insert boundary to typed validation and conflict failures', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    await insertTarget(database, { id: 'new-target' })
    const service = createService(database, [])
    const active = await service.banUser({
      context: authentication('admin-actor', 'admin', 'admin'),
      targetUserId: 'target-user',
      expectedStateVersion: null,
      kind: 'temporary',
      expiresAt: await futureDatabaseTime(database, '1 hour'),
      reason: 'Boundary-race setup',
    })
    const crossingExpiry = await futureDatabaseTime(database, '500 milliseconds')
    await database.query(`ALTER TABLE admin_user_ban_history DISABLE TRIGGER admin_user_ban_history_guard`)
    await database.query(`ALTER TABLE admin_user_ban_state DISABLE TRIGGER admin_user_ban_state_guard`)
    try {
      await database.query(`UPDATE admin_user_ban_history SET expires_at = $2 WHERE id = $1::bigint`, [
        active.event.id,
        crossingExpiry,
      ])
      await database.query(`UPDATE admin_user_ban_state SET ban_expires_at = $2 WHERE subject_user_id = $1`, [
        'target-user',
        crossingExpiry,
      ])
    } finally {
      await database.query(`ALTER TABLE admin_user_ban_state ENABLE TRIGGER admin_user_ban_state_guard`)
      await database.query(`ALTER TABLE admin_user_ban_history ENABLE TRIGGER admin_user_ban_history_guard`)
    }
    await database.query(
      `
        CREATE FUNCTION admin_user_ban_boundary_delay() RETURNS trigger
        LANGUAGE plpgsql AS $function$
        BEGIN
          PERFORM pg_sleep(0.75);
          RETURN NEW;
        END
        $function$
      `,
    )
    await database.query(
      `
        CREATE TRIGGER admin_user_ban_aa_boundary_delay
        BEFORE INSERT ON admin_user_ban_history
        FOR EACH ROW EXECUTE FUNCTION admin_user_ban_boundary_delay()
      `,
    )

    try {
      await expect(
        service.unbanUser({
          context: authentication('admin-actor', 'admin', 'admin'),
          targetUserId: 'target-user',
          expectedStateVersion: active.event.id,
        }),
      ).rejects.toMatchObject({ name: 'UserBanServiceFailure', code: 'CONFLICT' })

      await expect(
        service.banUser({
          context: authentication('admin-actor', 'admin', 'admin'),
          targetUserId: 'new-target',
          expectedStateVersion: null,
          kind: 'temporary',
          expiresAt: await futureDatabaseTime(database, '500 milliseconds'),
          reason: 'Expiry crosses during insertion',
        }),
      ).rejects.toMatchObject({ name: 'UserBanServiceFailure', code: 'VALIDATION_FAILED' })
    } finally {
      await database.query(`DROP TRIGGER IF EXISTS admin_user_ban_aa_boundary_delay ON admin_user_ban_history`)
      await database.query(`DROP FUNCTION IF EXISTS admin_user_ban_boundary_delay()`)
    }
    expect(await historyRows(database, 'target-user')).toHaveLength(1)
    expect(await historyRows(database, 'new-target')).toHaveLength(0)
  })

  it('returns subject-bound stable history pages with exact-millisecond ID tie-breaking', async () => {
    await insertActor(database, { id: 'admin-actor', role: 'admin' })
    await insertTarget(database)
    await insertTarget(database, { id: 'other-target' })
    const service = createService(database, [])
    let expectedStateVersion: string | null = null

    for (let index = 0; index < 5; index += 1) {
      const result: UserBanTransitionResult =
        index % 2 === 0
          ? await service.banUser({
              context: authentication('admin-actor', 'admin', 'admin'),
              targetUserId: 'target-user',
              expectedStateVersion,
              kind: 'permanent',
              reason: `Ban reason ${index}`,
            })
          : await service.unbanUser({
              context: authentication('admin-actor', 'admin', 'admin'),
              targetUserId: 'target-user',
              expectedStateVersion: expectedStateVersion!,
              reason: `Unban reason ${index}`,
            })
      expectedStateVersion = result.event.id
    }

    await database.query(`ALTER TABLE admin_user_ban_history DISABLE TRIGGER admin_user_ban_history_guard`)
    try {
      await database.query(
        `
          WITH tie_time AS MATERIALIZED (
            SELECT clock_timestamp()::timestamptz(3) AS created_at
          )
          UPDATE admin_user_ban_history
          SET created_at = tie_time.created_at
          FROM tie_time
          WHERE subject_user_id = 'target-user'
        `,
      )
    } finally {
      await database.query(`ALTER TABLE admin_user_ban_history ENABLE TRIGGER admin_user_ban_history_guard`)
    }

    const first = await service.listHistory({ subjectUserId: 'target-user', limit: 2 })
    const second = await service.listHistory({
      subjectUserId: 'target-user',
      cursor: first.nextCursor!,
      limit: 2,
    })
    const third = await service.listHistory({
      subjectUserId: 'target-user',
      cursor: second.nextCursor!,
      limit: 2,
    })
    expect([first.items.length, second.items.length, third.items.length]).toEqual([2, 2, 1])
    expect(third.nextCursor).toBeNull()
    const items = [...first.items, ...second.items, ...third.items]
    expect(new Set(items.map((item) => item.id)).size).toBe(5)
    expect(items.map((item) => BigInt(item.id))).toEqual(
      [...items.map((item) => BigInt(item.id))].sort((left, right) => (left > right ? -1 : left < right ? 1 : 0)),
    )
    await expect(
      service.listHistory({ subjectUserId: 'other-target', cursor: first.nextCursor!, limit: 2 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(
      service.listHistory({ subjectUserId: 'target-user', cursor: 'not a cursor', limit: 2 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(service.listHistory({ subjectUserId: 'target-user', limit: 101 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
  })

  it('projects only active ban kind/expiry into the administrator roster and never exposes reasons', async () => {
    await insertActor(database, { id: 'super-actor', role: 'user' })
    await insertTarget(database, { id: 'temporary-admin', role: 'admin' })
    await insertTarget(database, { id: 'permanent-admin', role: 'admin' })
    await insertTarget(database, { id: 'expired-admin', role: 'admin' })
    await insertTarget(database, { id: 'unbanned-admin', role: 'admin' })
    const allowlist = parseSuperAdministratorAllowlist('["super-actor"]', ALLOWLIST_EFFECTIVE_AT)
    const banService = createPostgresUserBanService({
      store: createPostgresUserBanStore(database),
      superAdministrators: allowlist,
    })
    const context = authentication('super-actor', 'user', 'super_admin')
    const temporaryExpiry = await futureDatabaseTime(database)
    const temporary = await banService.banUser({
      context,
      targetUserId: 'temporary-admin',
      expectedStateVersion: null,
      kind: 'temporary',
      expiresAt: temporaryExpiry,
      reason: 'private temporary reason',
    })
    await banService.banUser({
      context,
      targetUserId: 'permanent-admin',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'private permanent reason',
    })
    await banService.banUser({
      context,
      targetUserId: 'expired-admin',
      expectedStateVersion: null,
      kind: 'temporary',
      expiresAt: await futureDatabaseTime(database),
      reason: 'private expired reason',
    })
    await expireProjectedBan(database, 'expired-admin')
    const beforeUnban = await banService.banUser({
      context,
      targetUserId: 'unbanned-admin',
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'private unbanned reason',
    })
    await banService.unbanUser({
      context,
      targetUserId: 'unbanned-admin',
      expectedStateVersion: beforeUnban.event.id,
    })

    const roster = await createPostgresAdministratorRoleService({
      superAdministrators: allowlist,
      store: createPostgresAdministratorRoleStore(database),
    }).listAdministrators()
    const byId = new Map(roster.items.map((item) => [item.userId, item.accountStatus]))
    expect(byId.get('temporary-admin')).toEqual({
      status: 'temporarily_banned',
      expiresAt: temporary.state.banExpiresAt!.toISOString(),
    })
    expect(byId.get('permanent-admin')).toEqual({ status: 'permanently_banned' })
    expect(byId.get('expired-admin')).toEqual({ status: 'active' })
    expect(byId.get('unbanned-admin')).toEqual({ status: 'active' })
    expect(byId.get('super-actor')).toEqual({ status: 'active' })
    const serialized = JSON.stringify(roster)
    for (const reason of [
      'private temporary reason',
      'private permanent reason',
      'private expired reason',
      'private unbanned reason',
    ]) {
      expect(serialized).not.toContain(reason)
    }
  })
})