import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import {
  createPublicAccessPolicy,
  normalizePublicCanonicalSession,
  PublicAccountBanned,
  PublicAuthenticationRequired,
  UnclassifiedPublicProcedure,
  type CanonicalPublicSession,
  type PublicUserWriteLeaseRunner,
} from './public-access-policy.js'
import type { EvaluatedUserBanState } from './admin/user-ban-store.js'

const authentication = {
  user: {
    id: 'user-id',
    name: 'User',
    email: 'user@example.test',
    emailVerified: true,
    image: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  session: { id: 'session-id' },
} satisfies CanonicalPublicSession

const banState = (overrides: Partial<EvaluatedUserBanState> = {}): EvaluatedUserBanState => ({
  subjectUserId: authentication.user.id,
  stateVersion: null,
  establishedAction: null,
  status: 'unbanned',
  active: false,
  banStartedAt: null,
  banExpiresAt: null,
  banReason: null,
  actorUserId: null,
  evaluatedAt: new Date('2026-08-24T00:00:00.000Z'),
  ...overrides,
})

const createHarness = ({
  session = authentication,
  state = banState(),
}: {
  readonly session?: CanonicalPublicSession | null
  readonly state?: EvaluatedUserBanState
} = {}) => {
  const loadSession = vi.fn().mockResolvedValue(session)
  const loadBanState = vi.fn().mockResolvedValue(state)
  const runWriteLeaseCalls = vi.fn()
  const runWriteLease: PublicUserWriteLeaseRunner = async (identity, operation) => {
    runWriteLeaseCalls(identity, operation)
    return operation()
  }
  const policy = createPublicAccessPolicy({
    loadSession,
    loadBanState,
    database: {} as Pool,
    runWriteLease,
  })
  return { policy, loadSession, loadBanState, runWriteLease: runWriteLeaseCalls }
}

describe('public API access policy', () => {
  it('never mistakes a Better Auth transport Response for a canonical session', () => {
    expect(normalizePublicCanonicalSession(new Response('null'))).toBeNull()
    expect(normalizePublicCanonicalSession(authentication)).toBe(authentication)
    expect(normalizePublicCanonicalSession({ user: authentication.user })).toBeNull()
  })

  it.each(['public_read', 'identity_independent'] as const)(
    'never inspects a session or ban for %s procedures',
    async (access) => {
      const { policy, loadSession, loadBanState, runWriteLease } = createHarness()
      const operation = vi.fn().mockResolvedValue('ok')

      await expect(policy({ access, headers: new Headers({ cookie: 'stale=banned' }), operation })).resolves.toBe('ok')
      expect(operation).toHaveBeenCalledWith()
      expect(loadSession).not.toHaveBeenCalled()
      expect(loadBanState).not.toHaveBeenCalled()
      expect(runWriteLease).not.toHaveBeenCalled()
    },
  )

  it.each(['authenticated_read', 'authenticated_write'] as const)(
    'uses a generic denial when %s has no current canonical session',
    async (access) => {
      const { policy, loadBanState, runWriteLease } = createHarness({ session: null })
      await expect(
        policy({ access, headers: new Headers(), operation: vi.fn().mockResolvedValue('unreachable') }),
      ).rejects.toBeInstanceOf(PublicAuthenticationRequired)
      expect(loadBanState).not.toHaveBeenCalled()
      expect(runWriteLease).not.toHaveBeenCalled()
    },
  )

  it('returns only the current reason and expiry to the affected authenticated user', async () => {
    const expiresAt = new Date('2026-08-25T00:00:00.000Z')
    const { policy } = createHarness({
      state: banState({
        establishedAction: 'ban',
        status: 'temporarily_banned',
        active: true,
        banReason: 'Repeated abuse',
        banExpiresAt: expiresAt,
      }),
    })

    const error = await policy({
      access: 'authenticated_read',
      headers: new Headers(),
      operation: vi.fn().mockResolvedValue('unreachable'),
    }).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(PublicAccountBanned)
    expect(error).toMatchObject({ reason: 'Repeated abuse', expiresAt })
    expect((error as Error).message).not.toContain('Repeated abuse')
    expect((error as Error).message).not.toContain(authentication.user.id)
    expect(Object.keys(error as object)).not.toEqual(expect.arrayContaining(['reason', 'expiresAt']))
  })

  it('allows an expired ban according to the authoritative database-time projection', async () => {
    const { policy, loadBanState } = createHarness({
      state: banState({
        establishedAction: 'ban',
        status: 'expired',
        active: false,
        banReason: 'Expired reason',
        banExpiresAt: new Date('2026-08-23T00:00:00.000Z'),
      }),
    })
    const operation = vi.fn().mockResolvedValue('ok')

    await expect(policy({ access: 'authenticated_read', headers: new Headers(), operation })).resolves.toBe('ok')
    expect(loadBanState).toHaveBeenCalledOnce()
    expect(operation).toHaveBeenCalledWith(authentication.user)
  })

  it.each(['tags.attach', 'comments.create', 'aliases.create', 'lxns.authorize', 'lxns.start', 'lxns.disconnect'])(
    'runs the %s family inside the same serialized user-write lease',
    async () => {
      const { policy, loadBanState, runWriteLease } = createHarness()
      const operation = vi.fn().mockResolvedValue('ok')

      await expect(policy({ access: 'authenticated_write', headers: new Headers(), operation })).resolves.toBe('ok')
      expect(runWriteLease).toHaveBeenCalledWith(
        { userId: authentication.user.id, sessionId: authentication.session.id },
        expect.any(Function),
      )
      expect(loadBanState).not.toHaveBeenCalled()
      expect(operation).toHaveBeenCalledWith(authentication.user)
    },
  )

  it('fails closed before authentication when a procedure is not classified', async () => {
    const { policy, loadSession } = createHarness()
    await expect(
      policy({
        access: 'unclassified',
        headers: new Headers(),
        operation: vi.fn().mockResolvedValue('unreachable'),
      }),
    ).rejects.toBeInstanceOf(UnclassifiedPublicProcedure)
    expect(loadSession).not.toHaveBeenCalled()
  })
})