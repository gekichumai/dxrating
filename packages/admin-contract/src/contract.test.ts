import { describe, expect, it } from 'vitest'
import { ADMIN_CONTRACT_COMPATIBILITY_ID } from './compatibility.js'
import {
  ADMIN_BOOTSTRAP_AUTHORIZATION,
  ADMIN_DEFAULT_AUTHORIZATION,
  ADMIN_ERROR_MESSAGES,
  ADMIN_PRIMARY_AUTH_ACTION_POLICY,
  ADMIN_PRIMARY_AUTH_ACTIONS,
  ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH,
  ADMIN_ROLE_HISTORY_DEFAULT_LIMIT,
  ADMIN_ROLE_HISTORY_MAX_LIMIT,
  ADMIN_USER_BAN_REASON_MAX_LENGTH,
  ADMIN_USER_DISPLAY_NAME_PREFIX_MIN_LENGTH,
  ADMIN_USER_HISTORY_DEFAULT_LIMIT,
  ADMIN_USER_SEARCH_DEFAULT_LIMIT,
  ADMIN_USER_SEARCH_MAX_LIMIT,
  ADMIN_USER_TEMPORARY_BAN_MAX_DURATION_DAYS,
  AdminAccountStatusSchema,
  AdminAdministratorRoleChangeSchema,
  AdminAdministratorRoleHistoryInputSchema,
  AdminAdministratorRosterOutputSchema,
  AdminBanUserInputSchema,
  AdminBootstrapOutputSchema,
  AdminGrantAdministratorInputSchema,
  AdminGrantAdministratorOutputSchema,
  AdminGetUserModerationDetailOutputSchema,
  AdminListUserBanHistoryInputSchema,
  AdminListUserBanHistoryOutputSchema,
  AdminPrimaryAuthActionSchema,
  AdminPrimaryAuthOauthInitiateInputSchema,
  AdminPrimaryAuthPasswordInputSchema,
  AdminPrimaryAuthProviderSchema,
  AdminProcedureAuthorizationPolicySchema,
  AdminProcedureBanPolicySchema,
  AdminRevokeAdministratorInputSchema,
  AdminRevokeAdministratorOutputSchema,
  AdminSearchUsersInputSchema,
  AdminSearchUsersOutputSchema,
  AdminUnbanUserInputSchema,
  AdminUserBanMutationOutputSchema,
  AdminUserBanStateSchema,
  adminActionRequiresRecentPrimaryAuth,
  adminAuthorizationForAction,
  adminContract,
  adminErrors,
} from './contract.js'
import { computeAdminContractCompatibilityId, generateAdminOpenApiDocument } from './openapi.js'

describe('private administrator contract', () => {
  it('exposes the bootstrap and primary-authentication routes without an OAuth completion procedure', () => {
    expect(Object.keys(adminContract)).toEqual([
      'bootstrap',
      'primaryAuthStatus',
      'completePrimaryAuthPassword',
      'initiatePrimaryAuthOauth',
      'searchUsers',
      'getUserModerationDetail',
      'listUserBanHistory',
      'banUser',
      'unbanUser',
      'listAdministrators',
      'listAdministratorRoleHistory',
      'grantAdministrator',
      'revokeAdministrator',
    ])

    expect(
      Object.fromEntries(Object.entries(adminContract).map(([name, procedure]) => [name, procedure['~orpc'].route])),
    ).toMatchObject({
      bootstrap: {
        method: 'GET',
        path: '/bootstrap',
        operationId: 'getAdminBootstrap',
      },
      primaryAuthStatus: {
        method: 'GET',
        path: '/primary-auth/status',
        operationId: 'getAdminPrimaryAuthStatus',
      },
      completePrimaryAuthPassword: {
        method: 'POST',
        path: '/primary-auth/password',
        operationId: 'completeAdminPrimaryAuthPassword',
      },
      initiatePrimaryAuthOauth: {
        method: 'POST',
        path: '/primary-auth/oauth/initiate',
        operationId: 'initiateAdminPrimaryAuthOauth',
      },
      searchUsers: {
        method: 'POST',
        path: '/users/search',
        operationId: 'searchAdminUsers',
      },
      getUserModerationDetail: {
        method: 'GET',
        path: '/users/{userId}',
        operationId: 'getAdminUserModerationDetail',
      },
      listUserBanHistory: {
        method: 'GET',
        path: '/users/{userId}/ban-history',
        operationId: 'listAdminUserBanHistory',
      },
      banUser: {
        method: 'POST',
        path: '/users/{userId}/ban',
        operationId: 'banAdminUser',
      },
      unbanUser: {
        method: 'POST',
        path: '/users/{userId}/unban',
        operationId: 'unbanAdminUser',
      },
      listAdministrators: {
        method: 'GET',
        path: '/administrators',
        operationId: 'listAdminAdministrators',
      },
      listAdministratorRoleHistory: {
        method: 'GET',
        path: '/administrators/{userId}/role-history',
        operationId: 'listAdminAdministratorRoleHistory',
      },
      grantAdministrator: {
        method: 'POST',
        path: '/administrators/{userId}/grant',
        operationId: 'grantAdminAdministrator',
      },
      revokeAdministrator: {
        method: 'POST',
        path: '/administrators/{userId}/revoke',
        operationId: 'revokeAdminAdministrator',
      },
    })

    expect('completePrimaryAuthOauth' in adminContract).toBe(false)
    expect(AdminPrimaryAuthProviderSchema.options).toEqual(['google'])
    expect(
      AdminPrimaryAuthOauthInitiateInputSchema.safeParse({
        headers: {},
        body: { provider: 'github' },
      }).success,
    ).toBe(false)
    expect(
      AdminPrimaryAuthPasswordInputSchema.safeParse({
        headers: {},
        body: { password: '' },
      }).success,
    ).toBe(false)
    expect(
      AdminPrimaryAuthOauthInitiateInputSchema.safeParse({
        headers: {},
        body: { provider: 'unlinked-provider' },
      }).success,
    ).toBe(false)
  })

  it('applies fail-closed metadata and the complete sanitized error map to every procedure', () => {
    const expectedErrors = [
      'ADMIN_CLIENT_INCOMPATIBLE',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'RECENT_AUTH_REQUIRED',
      'FRESH_LOGIN_REQUIRED',
      'STEP_UP_FAILED',
      'STEP_UP_RATE_LIMITED',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL_SERVER_ERROR',
    ]

    for (const procedure of Object.values(adminContract)) {
      expect(Object.keys(procedure['~orpc'].errorMap)).toEqual(expectedErrors)
      expect(AdminProcedureBanPolicySchema.safeParse(procedure['~orpc'].meta.banPolicy).success).toBe(true)
      expect(procedure['~orpc'].meta.banPolicy).not.toBe('unclassified')
      expect(procedure['~orpc'].meta.banPolicy === 'transactional_write').toBe(
        procedure['~orpc'].meta.authorization.targetAction !== null,
      )
    }

    expect(
      Object.fromEntries(
        Object.entries(adminContract).map(([name, procedure]) => [name, procedure['~orpc'].meta.banPolicy]),
      ),
    ).toEqual({
      bootstrap: 'authenticated_read',
      primaryAuthStatus: 'authenticated_read',
      completePrimaryAuthPassword: 'authenticated_write',
      initiatePrimaryAuthOauth: 'authenticated_write',
      searchUsers: 'authenticated_read',
      getUserModerationDetail: 'authenticated_read',
      listUserBanHistory: 'authenticated_read',
      banUser: 'transactional_write',
      unbanUser: 'transactional_write',
      listAdministrators: 'authenticated_read',
      listAdministratorRoleHistory: 'authenticated_read',
      grantAdministrator: 'transactional_write',
      revokeAdministrator: 'transactional_write',
    })

    for (const procedure of [
      adminContract.bootstrap,
      adminContract.primaryAuthStatus,
      adminContract.completePrimaryAuthPassword,
      adminContract.initiatePrimaryAuthOauth,
      adminContract.searchUsers,
      adminContract.getUserModerationDetail,
      adminContract.listUserBanHistory,
      adminContract.listAdministrators,
      adminContract.listAdministratorRoleHistory,
    ]) {
      expect(procedure['~orpc'].meta.authorization).toEqual(ADMIN_DEFAULT_AUTHORIZATION)
    }

    expect(adminContract.grantAdministrator['~orpc'].meta.authorization).toEqual(
      adminAuthorizationForAction('administrator.grant', {
        minimumRole: 'super_admin',
        targetAction: 'manage_administrator_role',
      }),
    )
    expect(adminContract.revokeAdministrator['~orpc'].meta.authorization).toEqual(
      adminAuthorizationForAction('administrator.revoke', {
        minimumRole: 'super_admin',
        targetAction: 'manage_administrator_role',
      }),
    )
    expect(adminContract.banUser['~orpc'].meta.authorization).toEqual(
      adminAuthorizationForAction('user.ban', {
        minimumRole: 'admin',
        targetAction: 'moderate',
      }),
    )
    expect(adminContract.unbanUser['~orpc'].meta.authorization).toEqual(
      adminAuthorizationForAction('user.unban', {
        minimumRole: 'admin',
        targetAction: 'moderate',
      }),
    )

    expect(Object.keys(adminContract.bootstrap['~orpc'].errorMap)).toEqual([
      'ADMIN_CLIENT_INCOMPATIBLE',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'RECENT_AUTH_REQUIRED',
      'FRESH_LOGIN_REQUIRED',
      'STEP_UP_FAILED',
      'STEP_UP_RATE_LIMITED',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL_SERVER_ERROR',
    ])
    expect(adminContract.bootstrap['~orpc'].meta.authorization).toEqual(ADMIN_BOOTSTRAP_AUTHORIZATION)

    expect(adminErrors.STEP_UP_FAILED).toMatchObject({
      status: 401,
      message: ADMIN_ERROR_MESSAGES.STEP_UP_FAILED,
    })
    expect(adminErrors.STEP_UP_RATE_LIMITED).toMatchObject({
      status: 429,
      message: ADMIN_ERROR_MESSAGES.STEP_UP_RATE_LIMITED,
    })
    expect(adminErrors.STEP_UP_FAILED.data.parse({ requestId: null })).toEqual({
      requestId: null,
    })
    expect(adminErrors.STEP_UP_RATE_LIMITED.data.parse({ requestId: null })).toEqual({ requestId: null })
  })

  it('generates a deterministic private OpenAPI document and identifier', async () => {
    const document = await generateAdminOpenApiDocument()
    expect(document.servers).toEqual([{ url: '/api/admin' }])
    expect(Object.keys(document.paths ?? {})).toEqual([
      '/bootstrap',
      '/primary-auth/status',
      '/primary-auth/password',
      '/primary-auth/oauth/initiate',
      '/users/search',
      '/users/{userId}',
      '/users/{userId}/ban-history',
      '/users/{userId}/ban',
      '/users/{userId}/unban',
      '/administrators',
      '/administrators/{userId}/role-history',
      '/administrators/{userId}/grant',
      '/administrators/{userId}/revoke',
    ])
    expect(
      Object.fromEntries(Object.entries(document.paths ?? {}).map(([path, item]) => [path, Object.keys(item ?? {})])),
    ).toEqual({
      '/bootstrap': ['get'],
      '/primary-auth/status': ['get'],
      '/primary-auth/password': ['post'],
      '/primary-auth/oauth/initiate': ['post'],
      '/users/search': ['post'],
      '/users/{userId}': ['get'],
      '/users/{userId}/ban-history': ['get'],
      '/users/{userId}/ban': ['post'],
      '/users/{userId}/unban': ['post'],
      '/administrators': ['get'],
      '/administrators/{userId}/role-history': ['get'],
      '/administrators/{userId}/grant': ['post'],
      '/administrators/{userId}/revoke': ['post'],
    })
    expect(document.paths?.['/users/search']?.post?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              email: { type: 'string', format: 'email', maxLength: 320 },
              displayName: { type: 'string', minLength: 2, maxLength: 255 },
            },
          },
        },
      },
    })

    const serializedDocument = JSON.stringify(document)
    expect(serializedDocument).not.toContain('/primary-auth/oauth/complete')
    expect(serializedDocument).not.toContain('completeAdminPrimaryAuthOauth')
    expect(serializedDocument).toContain('STEP_UP_FAILED')
    expect(serializedDocument).toContain('STEP_UP_RATE_LIMITED')
    expect(await computeAdminContractCompatibilityId()).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
  })

  it('returns only approved administrator roster identity, role, source, and account-status fields', () => {
    const output = AdminAdministratorRosterOutputSchema.parse({
      items: [
        {
          userId: 'database-administrator',
          displayName: 'Database administrator',
          email: 'database@example.com',
          emailVerified: false,
          effectiveRole: 'admin',
          roleSource: 'database',
          accountStatus: { status: 'active' },
          sessionToken: 'must-not-cross-contract',
          ipAddress: '192.0.2.10',
          userAgent: 'private browser data',
          oauthAccessToken: 'must-not-cross-contract',
        },
        {
          userId: 'deployment-super-administrator',
          displayName: 'Super administrator',
          email: 'super@example.com',
          emailVerified: true,
          effectiveRole: 'super_admin',
          roleSource: 'deployment',
          accountStatus: { status: 'active' },
        },
      ],
      deploymentAllowlist: ['must-not-cross-contract'],
    })

    expect(output).toEqual({
      items: [
        {
          userId: 'database-administrator',
          displayName: 'Database administrator',
          email: 'database@example.com',
          emailVerified: false,
          effectiveRole: 'admin',
          roleSource: 'database',
          accountStatus: { status: 'active' },
        },
        {
          userId: 'deployment-super-administrator',
          displayName: 'Super administrator',
          email: 'super@example.com',
          emailVerified: true,
          effectiveRole: 'super_admin',
          roleSource: 'deployment',
          accountStatus: { status: 'active' },
        },
      ],
    })
    expect(JSON.stringify(output)).not.toMatch(/token|oauth|ipAddress|userAgent|allowlist/i)

    expect(
      AdminAdministratorRosterOutputSchema.safeParse({
        items: [
          {
            ...output.items[0],
            effectiveRole: 'super_admin',
            roleSource: 'database',
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      AdminAccountStatusSchema.safeParse({
        status: 'temporarily_banned',
        expiresAt: '2026-08-25T12:00:00.000Z',
      }).success,
    ).toBe(true)
    expect(
      AdminAccountStatusSchema.safeParse({
        status: 'temporarily_banned',
      }).success,
    ).toBe(false)
    expect(AdminAccountStatusSchema.safeParse({ status: 'permanently_banned' }).success).toBe(true)
    expect(AdminAccountStatusSchema.safeParse({ status: 'banned', kind: 'temporary' }).success).toBe(false)
  })

  it('requires a bounded trimmed reason for role grants and revocations', () => {
    expect(
      AdminGrantAdministratorInputSchema.parse({
        headers: {},
        params: { userId: 'existing-user' },
        body: { reason: '  Approved for moderation coverage.  ' },
      }).body.reason,
    ).toBe('Approved for moderation coverage.')
    expect(
      AdminRevokeAdministratorInputSchema.parse({
        headers: {},
        params: { userId: 'existing-administrator' },
        body: { reason: '  Access is no longer required.  ' },
      }).body.reason,
    ).toBe('Access is no longer required.')

    for (const reason of ['', ' \n\t ']) {
      expect(
        AdminGrantAdministratorInputSchema.safeParse({
          headers: {},
          params: { userId: 'existing-user' },
          body: { reason },
        }).success,
      ).toBe(false)
      expect(
        AdminRevokeAdministratorInputSchema.safeParse({
          headers: {},
          params: { userId: 'existing-administrator' },
          body: { reason },
        }).success,
      ).toBe(false)
    }
    expect(
      AdminGrantAdministratorInputSchema.safeParse({
        headers: {},
        params: { userId: 'existing-user' },
        body: { reason: 'x'.repeat(ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH + 1) },
      }).success,
    ).toBe(false)
  })

  it('requires subject-scoped role history with bounded opaque cursor pagination', () => {
    expect(
      AdminAdministratorRoleHistoryInputSchema.parse({
        headers: {},
        params: { userId: 'history-subject' },
        query: {},
      }),
    ).toEqual({
      headers: {},
      params: { userId: 'history-subject' },
      query: { limit: ADMIN_ROLE_HISTORY_DEFAULT_LIMIT },
    })
    expect(
      AdminAdministratorRoleHistoryInputSchema.parse({
        headers: {},
        params: { userId: 'history-subject' },
        query: { cursor: 'opaque.cursor.payload', limit: String(ADMIN_ROLE_HISTORY_MAX_LIMIT) },
      }).query,
    ).toEqual({ cursor: 'opaque.cursor.payload', limit: ADMIN_ROLE_HISTORY_MAX_LIMIT })
    expect(
      AdminAdministratorRoleHistoryInputSchema.safeParse({
        headers: {},
        params: { userId: 'history-subject' },
        query: { limit: ADMIN_ROLE_HISTORY_MAX_LIMIT + 1 },
      }).success,
    ).toBe(false)
    expect(
      AdminAdministratorRoleHistoryInputSchema.safeParse({
        headers: {},
        params: { userId: 'history-subject' },
        query: { cursor: '' },
      }).success,
    ).toBe(false)
    expect(AdminAdministratorRoleHistoryInputSchema.safeParse({ headers: {}, params: {}, query: {} }).success).toBe(
      false,
    )
  })

  it('allows only persisted user-to-admin and admin-to-user history transitions', () => {
    const event = {
      id: '9223372036854775807',
      subjectUserId: 'subject-id',
      actorUserId: 'actor-id',
      previousRole: 'user',
      newRole: 'admin',
      reason: 'Operational coverage',
      changedAt: '2026-08-24T12:00:00.000Z',
    } as const

    expect(AdminAdministratorRoleChangeSchema.parse(event)).toEqual(event)
    expect(AdminGrantAdministratorOutputSchema.safeParse({ change: event }).success).toBe(true)
    expect(AdminRevokeAdministratorOutputSchema.safeParse({ change: event }).success).toBe(false)
    expect(
      AdminRevokeAdministratorOutputSchema.safeParse({
        change: { ...event, previousRole: 'admin', newRole: 'user' },
      }).success,
    ).toBe(true)
    expect(
      AdminAdministratorRoleChangeSchema.safeParse({
        ...event,
        previousRole: 'admin',
        newRole: 'admin',
      }).success,
    ).toBe(false)
    expect(
      AdminAdministratorRoleChangeSchema.safeParse({
        ...event,
        previousRole: 'admin',
        newRole: 'super_admin',
      }).success,
    ).toBe(false)
  })

  it('normalizes bounded user-search filters and keeps the request body strict', () => {
    expect(ADMIN_USER_SEARCH_DEFAULT_LIMIT).toBe(25)
    expect(ADMIN_USER_SEARCH_MAX_LIMIT).toBe(100)
    expect(ADMIN_USER_DISPLAY_NAME_PREFIX_MIN_LENGTH).toBe(2)

    expect(
      AdminSearchUsersInputSchema.parse({
        headers: {},
        body: {
          userId: 'immutable-user-id',
          email: '  MODERATOR@Example.COM  ',
          displayName: '  Example\t\n User  ',
          effectiveRole: 'admin',
          activeBan: false,
        },
      }),
    ).toEqual({
      headers: {},
      body: {
        userId: 'immutable-user-id',
        email: 'moderator@example.com',
        displayName: 'Example User',
        effectiveRole: 'admin',
        activeBan: false,
        limit: ADMIN_USER_SEARCH_DEFAULT_LIMIT,
      },
    })

    for (const body of [
      { displayName: 'x' },
      { email: 'not-an-email-prefix' },
      { userId: ' user-id' },
      { activeBan: 'false' },
      { cursor: 'not.a.cursor' },
      { limit: ADMIN_USER_SEARCH_MAX_LIMIT + 1 },
      { provider: 'google' },
    ]) {
      expect(AdminSearchUsersInputSchema.safeParse({ headers: {}, body }).success).toBe(false)
    }
  })

  it('exposes only approved user-search identity, role, and active-account status', () => {
    const row = {
      userId: 'search-user',
      displayName: 'Search User',
      email: 'search@example.com',
      emailVerified: true,
      effectiveRole: 'user' as const,
      accountStatus: { status: 'temporarily_banned' as const, expiresAt: '2026-08-25T12:00:00.000Z' },
    }
    expect(AdminSearchUsersOutputSchema.parse({ items: [row], nextCursor: null })).toEqual({
      items: [row],
      nextCursor: null,
    })

    for (const prohibitedField of [
      { stateVersion: '4' },
      { reason: 'private moderation reason' },
      { sessionToken: 'session-secret' },
      { oauthAccessToken: 'provider-secret' },
      { passkeyCredential: 'passkey-secret' },
      { ipAddress: '192.0.2.1' },
    ]) {
      expect(
        AdminSearchUsersOutputSchema.safeParse({ items: [{ ...row, ...prohibitedField }], nextCursor: null }).success,
      ).toBe(false)
    }
  })

  it('models coherent explicit current-ban states in the strict moderation detail DTO', () => {
    const identity = {
      userId: 'detail-user',
      displayName: 'Detail User',
      email: 'detail@example.com',
      emailVerified: false,
      effectiveRole: 'user' as const,
    }
    const evaluatedAt = '2026-08-24T12:00:00.000Z'

    const states = [
      {
        status: 'unbanned' as const,
        stateVersion: null,
        reason: null,
        actorUserId: null,
        banStartedAt: null,
        expiresAt: null,
        evaluatedAt,
      },
      {
        status: 'expired' as const,
        stateVersion: '1',
        reason: 'Past temporary restriction',
        actorUserId: 'admin-id',
        banStartedAt: '2026-08-20T12:00:00.000Z',
        expiresAt: '2026-08-23T12:00:00.000Z',
        evaluatedAt,
      },
      {
        status: 'temporary' as const,
        stateVersion: '2',
        reason: 'Current temporary restriction',
        actorUserId: 'admin-id',
        banStartedAt: '2026-08-24T10:00:00.000Z',
        expiresAt: '2026-08-25T12:00:00.000Z',
        evaluatedAt,
      },
      {
        status: 'permanent' as const,
        stateVersion: '3',
        reason: 'Permanent restriction',
        actorUserId: 'admin-id',
        banStartedAt: '2026-08-24T10:00:00.000Z',
        expiresAt: null,
        evaluatedAt,
      },
    ]

    for (const banState of states) {
      expect(AdminGetUserModerationDetailOutputSchema.parse({ ...identity, banState })).toEqual({
        ...identity,
        banState,
      })
      expect(AdminUserBanStateSchema.safeParse(banState).success).toBe(true)
    }

    for (const banState of [
      { ...states[0], stateVersion: '1' },
      { ...states[1], expiresAt: '2026-08-25T12:00:00.000Z' },
      { ...states[2], expiresAt: '2026-08-24T11:00:00.000Z' },
      { ...states[3], expiresAt: '2099-01-01T00:00:00.000Z' },
    ]) {
      expect(AdminUserBanStateSchema.safeParse(banState).success).toBe(false)
    }

    expect(
      AdminGetUserModerationDetailOutputSchema.safeParse({
        ...identity,
        banState: states[0],
        sessions: [{ token: 'must-not-cross-contract' }],
      }).success,
    ).toBe(false)
  })

  it('keeps ban-history events explicit, bounded, subject-scoped, and free of request correlation data', () => {
    const temporaryEvent = {
      id: '4',
      subjectUserId: 'history-user',
      actorUserId: 'admin-id',
      previousEventId: null,
      action: 'ban' as const,
      kind: 'temporary' as const,
      reason: 'Temporary restriction',
      banStartedAt: '2026-08-24T10:00:00.000Z',
      expiresAt: '2026-08-25T10:00:00.000Z',
      createdAt: '2026-08-24T10:00:00.000Z',
    }
    const permanentEvent = {
      ...temporaryEvent,
      id: '5',
      previousEventId: '4',
      kind: 'permanent' as const,
      expiresAt: null,
      reason: 'Permanent restriction',
    }
    const unbanEvent = {
      ...temporaryEvent,
      id: '6',
      previousEventId: '5',
      action: 'unban' as const,
      kind: null,
      reason: null,
      banStartedAt: null,
      expiresAt: null,
      createdAt: '2026-08-24T11:00:00.000Z',
    }
    expect(
      AdminListUserBanHistoryOutputSchema.parse({
        items: [unbanEvent, permanentEvent, temporaryEvent],
        nextCursor: 'opaque_next_page',
      }),
    ).toEqual({ items: [unbanEvent, permanentEvent, temporaryEvent], nextCursor: 'opaque_next_page' })
    expect(
      AdminListUserBanHistoryInputSchema.parse({ headers: {}, params: { userId: 'history-user' }, query: {} }),
    ).toEqual({
      headers: {},
      params: { userId: 'history-user' },
      query: { limit: ADMIN_USER_HISTORY_DEFAULT_LIMIT },
    })
    expect(
      AdminListUserBanHistoryOutputSchema.safeParse({
        items: [{ ...temporaryEvent, requestCorrelationId: '18d7118c-ec70-4603-9176-cffea8a6cd8f' }],
        nextCursor: null,
      }).success,
    ).toBe(false)
    expect(
      AdminListUserBanHistoryOutputSchema.safeParse({
        items: [{ ...unbanEvent, reason: 'Internal historical unban explanation' }],
        nextCursor: null,
      }).success,
    ).toBe(true)
  })

  it('requires strict temporary/permanent ban inputs and a reason while keeping unban reasonless', () => {
    expect(ADMIN_USER_BAN_REASON_MAX_LENGTH).toBe(1_000)
    expect(ADMIN_USER_TEMPORARY_BAN_MAX_DURATION_DAYS).toBe(365)

    const base = {
      headers: {},
      params: { userId: 'target-user' },
    }
    expect(
      AdminBanUserInputSchema.parse({
        ...base,
        body: {
          expectedStateVersion: null,
          kind: 'temporary',
          expiresAt: '2026-08-25T12:00:00.000Z',
          reason: '  Repeated harassment  ',
        },
      }).body,
    ).toEqual({
      expectedStateVersion: null,
      kind: 'temporary',
      expiresAt: '2026-08-25T12:00:00.000Z',
      reason: 'Repeated harassment',
    })
    expect(
      AdminBanUserInputSchema.safeParse({
        ...base,
        body: { expectedStateVersion: '7', kind: 'permanent', reason: 'Permanent safety restriction' },
      }).success,
    ).toBe(true)

    for (const body of [
      { expectedStateVersion: null, kind: 'temporary', reason: 'Missing expiry' },
      {
        expectedStateVersion: null,
        kind: 'temporary',
        expiresAt: '2026-08-25T13:00:00.000+01:00',
        reason: 'Offset is not UTC',
      },
      {
        expectedStateVersion: null,
        kind: 'permanent',
        expiresAt: '2099-01-01T00:00:00.000Z',
        reason: 'Fake permanent expiry',
      },
      { expectedStateVersion: null, kind: 'permanent', reason: '   ' },
      { expectedStateVersion: null, kind: 'permanent', reason: 'x'.repeat(ADMIN_USER_BAN_REASON_MAX_LENGTH + 1) },
      { expectedStateVersion: null, kind: 'permanent', reason: 'Valid', providerToken: 'secret' },
    ]) {
      expect(AdminBanUserInputSchema.safeParse({ ...base, body }).success).toBe(false)
    }

    expect(AdminUnbanUserInputSchema.parse({ ...base, body: { expectedStateVersion: '8' } }).body).toEqual({
      expectedStateVersion: '8',
    })
    expect(
      AdminUnbanUserInputSchema.safeParse({
        ...base,
        body: { expectedStateVersion: '8', reason: 'The API deliberately accepts no unban reason' },
      }).success,
    ).toBe(false)
  })

  it('returns only current state and the immutable event from moderation mutations', () => {
    const state = {
      status: 'permanent' as const,
      stateVersion: '9',
      reason: 'Permanent restriction',
      actorUserId: 'admin-id',
      banStartedAt: '2026-08-24T10:00:00.000Z',
      expiresAt: null,
      evaluatedAt: '2026-08-24T10:00:00.000Z',
    }
    const event = {
      id: '9',
      subjectUserId: 'target-user',
      actorUserId: 'admin-id',
      previousEventId: null,
      action: 'ban' as const,
      kind: 'permanent' as const,
      reason: 'Permanent restriction',
      banStartedAt: '2026-08-24T10:00:00.000Z',
      expiresAt: null,
      createdAt: '2026-08-24T10:00:00.000Z',
    }
    expect(AdminUserBanMutationOutputSchema.parse({ state, event })).toEqual({ state, event })
    expect(AdminUserBanMutationOutputSchema.safeParse({ state, event, revokedSessionCount: 3 }).success).toBe(false)
  })

  it('defines exactly five protected and six unprotected primary-authentication actions', () => {
    expect(ADMIN_PRIMARY_AUTH_ACTIONS).toHaveLength(11)
    expect(ADMIN_PRIMARY_AUTH_ACTION_POLICY).toEqual({
      'administrator.grant': true,
      'administrator.revoke': true,
      'user.ban': true,
      'user.unban': true,
      'comment.delete': true,
      'comment.restore': false,
      'chart_report.close': false,
      'chart_report.submit': false,
      'provenance.read': false,
      'dashboard.read': false,
      'raw_artifact.read': false,
    })

    const protectedActions = ADMIN_PRIMARY_AUTH_ACTIONS.filter(adminActionRequiresRecentPrimaryAuth)
    const unprotectedActions = ADMIN_PRIMARY_AUTH_ACTIONS.filter(
      (action) => !adminActionRequiresRecentPrimaryAuth(action),
    )

    expect(protectedActions).toEqual([
      'administrator.grant',
      'administrator.revoke',
      'user.ban',
      'user.unban',
      'comment.delete',
    ])
    expect(protectedActions).toHaveLength(5)
    expect(unprotectedActions).toEqual([
      'comment.restore',
      'chart_report.close',
      'chart_report.submit',
      'provenance.read',
      'dashboard.read',
      'raw_artifact.read',
    ])
    expect(unprotectedActions).toHaveLength(6)

    for (const action of ADMIN_PRIMARY_AUTH_ACTIONS) {
      expect(AdminPrimaryAuthActionSchema.parse(action)).toBe(action)
      const policy = adminAuthorizationForAction(action)
      expect(policy).toMatchObject({
        primaryAuthAction: action,
        recentPrimaryAuth: ADMIN_PRIMARY_AUTH_ACTION_POLICY[action],
      })
      expect(AdminProcedureAuthorizationPolicySchema.safeParse(policy).success).toBe(true)
    }
  })

  it('exposes only effective administrator authority and scoped capabilities', () => {
    const output = AdminBootstrapOutputSchema.parse({
      contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
      ready: true,
      principal: {
        userId: 'immutable-user-id',
        effectiveRole: 'super_admin',
        capabilities: {
          canModerateUsers: true,
          canModerateAdministrators: true,
          canManageAdministrators: true,
        },
      },
    })

    expect(output.principal).toEqual({
      userId: 'immutable-user-id',
      effectiveRole: 'super_admin',
      capabilities: {
        canModerateUsers: true,
        canModerateAdministrators: true,
        canManageAdministrators: true,
      },
    })
    expect(() =>
      AdminBootstrapOutputSchema.parse({
        ...output,
        principal: { ...output.principal, effectiveRole: 'user' },
      }),
    ).toThrow()
  })

  it('keeps recent-authentication and fresh-login recovery policies mutually exclusive', () => {
    expect(
      AdminProcedureAuthorizationPolicySchema.safeParse({
        ...adminAuthorizationForAction('comment.delete'),
        recentPrimaryAuth: true,
        freshLogin: true,
      }).success,
    ).toBe(false)
  })

  it('rejects procedure metadata that drifts from the central action matrix', () => {
    expect(
      AdminProcedureAuthorizationPolicySchema.safeParse({
        ...adminAuthorizationForAction('comment.delete'),
        recentPrimaryAuth: false,
      }).success,
    ).toBe(false)
    expect(
      AdminProcedureAuthorizationPolicySchema.safeParse({
        ...adminAuthorizationForAction('comment.restore'),
        recentPrimaryAuth: true,
      }).success,
    ).toBe(false)
    expect(
      AdminProcedureAuthorizationPolicySchema.safeParse({
        ...ADMIN_DEFAULT_AUTHORIZATION,
        recentPrimaryAuth: true,
      }).success,
    ).toBe(false)
  })
})