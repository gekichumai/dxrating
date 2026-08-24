import { describe, expect, it, vi } from 'vitest'
import { parseSuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import type { UserBanService } from './user-ban-service.js'
import type { EvaluatedUserBanState, StoredUserBanHistoryEvent } from './user-ban-store.js'
import { createUserModerationService, UserModerationServiceFailure } from './user-moderation-service.js'
import type { StoredUserModerationDetail, UserModerationStore } from './user-moderation-store.js'

const EVALUATED_AT = new Date('2026-08-24T12:00:00.000Z')
const STARTED_AT = new Date('2026-08-24T11:00:00.000Z')
const EXPIRES_AT = new Date('2026-08-25T12:00:00.000Z')
const ALLOWLIST_EFFECTIVE_AT = '2000-01-01T00:00:00.000Z'

const unbannedDetail = (userId = 'ordinary-user'): StoredUserModerationDetail => ({
  userId,
  displayName: 'Ordinary User',
  email: 'ordinary@example.test',
  emailVerified: true,
  effectiveRole: 'user',
  banState: {
    status: 'unbanned',
    stateVersion: null,
    reason: null,
    actorUserId: null,
    banStartedAt: null,
    expiresAt: null,
    evaluatedAt: EVALUATED_AT,
  },
})

const historyEvent: StoredUserBanHistoryEvent = {
  id: '7',
  subjectUserId: 'ordinary-user',
  actorUserId: 'admin-user',
  previousEventId: null,
  action: 'ban',
  reason: 'Private moderation reason',
  banStartedAt: STARTED_AT,
  expiresAt: EXPIRES_AT,
  requestCorrelationId: '11111111-1111-4111-8111-111111111111',
  createdAt: STARTED_AT,
}

const unbanHistoryEvent: StoredUserBanHistoryEvent = {
  id: '8',
  subjectUserId: 'ordinary-user',
  actorUserId: 'admin-user',
  previousEventId: '7',
  action: 'unban',
  reason: 'Cleared after internal review',
  banStartedAt: null,
  expiresAt: null,
  requestCorrelationId: null,
  createdAt: EVALUATED_AT,
}

const evaluatedState: EvaluatedUserBanState = {
  subjectUserId: 'ordinary-user',
  stateVersion: '7',
  establishedAction: 'ban',
  status: 'temporarily_banned',
  active: true,
  banStartedAt: STARTED_AT,
  banExpiresAt: EXPIRES_AT,
  banReason: 'Private moderation reason',
  actorUserId: 'admin-user',
  evaluatedAt: EVALUATED_AT,
}

const createStore = (overrides: Partial<UserModerationStore> = {}): UserModerationStore => ({
  loadExistingUsersById: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ id }))),
  searchUsers: vi.fn(async () => ({ items: [], hasMore: false })),
  loadUserDetail: vi.fn(async (userId) => unbannedDetail(userId)),
  ...overrides,
})

const createBans = (overrides: Partial<UserBanService> = {}): UserBanService => ({
  getCurrentState: vi.fn(async () => evaluatedState),
  listHistory: vi.fn(async () => ({ items: [historyEvent], nextCursor: null })),
  banUser: vi.fn(async () => ({ event: historyEvent, state: evaluatedState, revokedSessionCount: 4 })),
  unbanUser: vi.fn(async () => ({ event: historyEvent, state: evaluatedState, revokedSessionCount: 0 })),
  ...overrides,
})

const createService = (store: UserModerationStore, bans: UserBanService = createBans()) =>
  createUserModerationService({
    store,
    bans,
    superAdministrators: parseSuperAdministratorAllowlist(JSON.stringify(['allowlisted-user']), ALLOWLIST_EFFECTIVE_AT),
  })

describe('user moderation service', () => {
  it('normalizes bounded filters and binds PII-free cursors to the complete search', async () => {
    const searchUsers = vi
      .fn<UserModerationStore['searchUsers']>()
      .mockResolvedValueOnce({
        items: [
          {
            userId: 'ordinary-user',
            displayName: 'Ordinary User',
            email: 'ordinary@example.test',
            emailVerified: true,
            effectiveRole: 'user',
            banState: {
              status: 'unbanned',
              stateVersion: null,
              banStartedAt: null,
              expiresAt: null,
              evaluatedAt: EVALUATED_AT,
            },
          },
        ],
        hasMore: true,
      })
      .mockResolvedValue({ items: [], hasMore: false })
    const store = createStore({ searchUsers })
    const service = createService(store)
    const filters = {
      email: '  MODERATOR@EXAMPLE.TEST  ',
      displayName: '  Fullwidth Ａ  Name  ',
      effectiveRole: 'user' as const,
      activeBan: false,
      limit: 1,
    }

    const first = await service.searchUsers(filters)
    expect(first.items).toEqual([
      {
        userId: 'ordinary-user',
        displayName: 'Ordinary User',
        email: 'ordinary@example.test',
        emailVerified: true,
        effectiveRole: 'user',
        accountStatus: { status: 'active' },
      },
    ])
    expect(first.nextCursor).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]+$/))
    const decodedCursor = Buffer.from(first.nextCursor!, 'base64url').toString('utf8')
    expect(decodedCursor).not.toContain('moderator@example.test')
    expect(decodedCursor).not.toContain('fullwidth')
    expect(JSON.parse(decodedCursor)).toEqual({
      version: 1,
      lastUserId: 'ordinary-user',
      filterDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(searchUsers).toHaveBeenNthCalledWith(1, {
      filters: {
        userId: undefined,
        email: 'moderator@example.test',
        displayName: 'Fullwidth A Name',
        effectiveRole: 'user',
        activeBan: false,
      },
      afterUserId: undefined,
      limit: 1,
      allowlistedUserIds: ['allowlisted-user'],
    })

    await service.searchUsers({ ...filters, cursor: first.nextCursor! })
    expect(searchUsers).toHaveBeenNthCalledWith(2, expect.objectContaining({ afterUserId: 'ordinary-user' }))
    await expect(
      service.searchUsers({ ...filters, email: 'different@example.test', cursor: first.nextCursor! }),
    ).rejects.toBeInstanceOf(UserModerationServiceFailure)
    expect(searchUsers).toHaveBeenCalledTimes(2)
  })

  it('binds cursors before PostgreSQL case folding can conflate Unicode display filters', async () => {
    const searchUsers = vi.fn<UserModerationStore['searchUsers']>().mockResolvedValueOnce({
      items: [
        {
          userId: 'ordinary-user',
          displayName: 'İX User',
          email: 'ordinary@example.test',
          emailVerified: true,
          effectiveRole: 'user',
          banState: {
            status: 'unbanned',
            stateVersion: null,
            banStartedAt: null,
            expiresAt: null,
            evaluatedAt: EVALUATED_AT,
          },
        },
      ],
      hasMore: true,
    })
    const service = createService(createStore({ searchUsers }))

    const first = await service.searchUsers({ displayName: 'İX', limit: 1 })
    await expect(
      service.searchUsers({ displayName: 'i\u0307x', limit: 1, cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(searchUsers).toHaveBeenCalledTimes(1)
  })

  it('returns a typed not-found failure and projects only approved detail fields', async () => {
    const loadUserDetail = vi
      .fn<UserModerationStore['loadUserDetail']>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        ...unbannedDetail('allowlisted-user'),
        effectiveRole: 'super_admin',
        banState: {
          status: 'temporary',
          stateVersion: '9',
          reason: 'Private moderation reason',
          actorUserId: 'admin-user',
          banStartedAt: STARTED_AT,
          expiresAt: EXPIRES_AT,
          evaluatedAt: EVALUATED_AT,
        },
      })
    const service = createService(createStore({ loadUserDetail }))

    await expect(service.getUserModerationDetail('missing-user')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const detail = await service.getUserModerationDetail('allowlisted-user')
    expect(loadUserDetail).toHaveBeenLastCalledWith('allowlisted-user', ['allowlisted-user'])
    expect(detail).toEqual({
      userId: 'allowlisted-user',
      displayName: 'Ordinary User',
      email: 'ordinary@example.test',
      emailVerified: true,
      effectiveRole: 'super_admin',
      banState: {
        status: 'temporary',
        stateVersion: '9',
        reason: 'Private moderation reason',
        actorUserId: 'admin-user',
        banStartedAt: STARTED_AT.toISOString(),
        expiresAt: EXPIRES_AT.toISOString(),
        evaluatedAt: EVALUATED_AT.toISOString(),
      },
    })
  })

  it('establishes subject existence before history and strips correlation and revocation metadata', async () => {
    const listHistory = vi.fn<UserBanService['listHistory']>(async () => ({
      items: [historyEvent, unbanHistoryEvent],
      nextCursor: null,
    }))
    const banUser = vi.fn<UserBanService['banUser']>(async () => ({
      event: historyEvent,
      state: evaluatedState,
      revokedSessionCount: 99,
    }))
    const bans = createBans({ listHistory, banUser })
    const loadUserDetail = vi.fn<UserModerationStore['loadUserDetail']>(async (userId) => unbannedDetail(userId))
    const service = createService(createStore({ loadUserDetail }), bans)

    const history = await service.listBanHistory({ userId: 'ordinary-user' })
    expect(loadUserDetail).toHaveBeenCalledBefore(listHistory)
    expect(listHistory).toHaveBeenCalledWith({ subjectUserId: 'ordinary-user', cursor: undefined, limit: 25 })
    expect(history.items).toEqual([
      {
        id: '7',
        subjectUserId: 'ordinary-user',
        actorUserId: 'admin-user',
        previousEventId: null,
        action: 'ban',
        kind: 'temporary',
        reason: 'Private moderation reason',
        banStartedAt: STARTED_AT.toISOString(),
        expiresAt: EXPIRES_AT.toISOString(),
        createdAt: STARTED_AT.toISOString(),
      },
      {
        id: '8',
        subjectUserId: 'ordinary-user',
        actorUserId: 'admin-user',
        previousEventId: '7',
        action: 'unban',
        kind: null,
        reason: 'Cleared after internal review',
        banStartedAt: null,
        expiresAt: null,
        createdAt: EVALUATED_AT.toISOString(),
      },
    ])
    expect(JSON.stringify(history)).not.toContain('11111111-1111-4111-8111-111111111111')

    const mutation = await service.banUser({
      context: {},
      targetUserId: 'ordinary-user',
      expectedStateVersion: null,
      kind: 'temporary',
      expiresAt: EXPIRES_AT,
      reason: 'Private moderation reason',
    })
    expect(mutation).toMatchObject({ state: { status: 'temporary' }, event: { id: '7', kind: 'temporary' } })
    expect(JSON.stringify(mutation)).not.toContain('revokedSessionCount')
    expect(JSON.stringify(mutation)).not.toContain('11111111-1111-4111-8111-111111111111')
  })

  it('rejects invalid limits, malformed cursors, and store-service validation failures generically', async () => {
    const service = createService(createStore())
    await expect(service.searchUsers({ displayName: 'x' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(service.searchUsers({ limit: 101 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(service.searchUsers({ cursor: 'not_json' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(service.listBanHistory({ userId: 'ordinary-user', limit: 101 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
  })
})