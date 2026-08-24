import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createAdminDataClient, type AdminClient } from './admin-client'
import { isAdminNetworkError, shouldRetryAdminRead } from './admin-errors'
import { isAdminClientIncompatibleError } from './compatibility'

const bootstrapOutput = {
  contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
  ready: true as const,
  principal: {
    userId: 'administrator-id',
    effectiveRole: 'admin' as const,
    capabilities: {
      canModerateUsers: true,
      canModerateAdministrators: false,
      canManageAdministrators: false,
    },
  },
}

const jsonResponse = (body: unknown, init: ResponseInit = {}) => Response.json(body, { status: 200, ...init })

describe('private administrator data client', () => {
  it('exposes headerless procedure and query utility inputs', () => {
    type BootstrapInput = Parameters<AdminClient['bootstrap']>[0]
    type PasswordInput = Parameters<AdminClient['completePrimaryAuthPassword']>[0]
    type OauthInput = Parameters<AdminClient['initiatePrimaryAuthOauth']>[0]
    type UserSearchInput = Parameters<AdminClient['searchUsers']>[0]
    type UserDetailInput = Parameters<AdminClient['getUserModerationDetail']>[0]
    type BanHistoryInput = Parameters<AdminClient['listUserBanHistory']>[0]
    type BanUserInput = Parameters<AdminClient['banUser']>[0]
    type UnbanUserInput = Parameters<AdminClient['unbanUser']>[0]
    type RosterInput = Parameters<AdminClient['listAdministrators']>[0]
    type HistoryInput = Parameters<AdminClient['listAdministratorRoleHistory']>[0]
    type GrantInput = Parameters<AdminClient['grantAdministrator']>[0]
    type RevokeInput = Parameters<AdminClient['revokeAdministrator']>[0]

    expectTypeOf<BootstrapInput>().toEqualTypeOf<undefined>()
    expectTypeOf<PasswordInput>().toEqualTypeOf<{ body: { password: string } }>()
    expectTypeOf<OauthInput>().toEqualTypeOf<{ body: { provider: 'google' } }>()
    expectTypeOf<UserSearchInput>().toMatchTypeOf<{
      body: {
        userId?: string
        email?: string
        displayName?: string
        effectiveRole?: 'user' | 'admin' | 'super_admin'
        activeBan?: boolean
        cursor?: string
        limit?: number
      }
    }>()
    expectTypeOf<UserDetailInput>().toEqualTypeOf<{ params: { userId: string } }>()
    expectTypeOf<BanHistoryInput>().toMatchTypeOf<{
      params: { userId: string }
      query: { cursor?: string; limit?: number }
    }>()
    expectTypeOf<BanUserInput>().toMatchTypeOf<{
      params: { userId: string }
      body:
        | { expectedStateVersion: string | null; kind: 'temporary'; expiresAt: string; reason: string }
        | { expectedStateVersion: string | null; kind: 'permanent'; reason: string }
    }>()
    expectTypeOf<UnbanUserInput>().toEqualTypeOf<{
      params: { userId: string }
      body: { expectedStateVersion: string | null }
    }>()
    expectTypeOf<RosterInput>().toEqualTypeOf<undefined>()
    expectTypeOf<HistoryInput>().toMatchTypeOf<{
      params: { userId: string }
      query: { cursor?: string; limit?: number }
    }>()
    expectTypeOf<GrantInput>().toEqualTypeOf<{
      params: { userId: string }
      body: { reason: string }
    }>()
    expectTypeOf<RevokeInput>().toEqualTypeOf<GrantInput>()

    const fetch = vi.fn(async () => jsonResponse(bootstrapOutput))
    const { client, orpc } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    expect(Object.keys(client)).toEqual([
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
    expect(orpc.bootstrap.queryOptions().queryKey).toBeDefined()
    expect(orpc.searchUsers.queryOptions({ input: { body: {} } }).queryKey).toBeDefined()
    expect(orpc.banUser.mutationOptions().mutationKey).toBeDefined()
    expect(orpc.listAdministrators.queryOptions().queryKey).toBeDefined()
  })

  it('serializes roster, subject-scoped history, and role changes only under the private admin prefix', async () => {
    const requests: Request[] = []
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const captured = request as Request
      requests.push(captured)

      if (captured.url.endsWith('/administrators')) return jsonResponse({ items: [] })
      if (captured.url.includes('/role-history')) return jsonResponse({ items: [], nextCursor: null })
      const revoking = captured.url.endsWith('/revoke')
      return jsonResponse({
        change: {
          id: revoking ? '2' : '1',
          subjectUserId: 'target-id',
          actorUserId: 'actor-id',
          previousRole: revoking ? 'admin' : 'user',
          newRole: revoking ? 'user' : 'admin',
          reason: 'Operational coverage',
          changedAt: '2026-08-24T12:00:00.000Z',
        },
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await client.listAdministrators()
    await client.listAdministratorRoleHistory({
      params: { userId: 'target-id' },
      query: { cursor: 'opaque-page', limit: 25 },
    })
    await client.grantAdministrator({
      params: { userId: 'target-id' },
      body: { reason: 'Operational coverage' },
    })
    await client.revokeAdministrator({
      params: { userId: 'target-id' },
      body: { reason: 'Operational coverage' },
    })

    expect(requests).toHaveLength(4)
    expect(requests[0]).toMatchObject({ method: 'GET' })
    expect(requests[0]?.url).toBe('https://api.dxrating.net/api/admin/administrators')
    expect(requests[1]).toMatchObject({ method: 'GET' })
    expect(requests[1]?.url).toContain('https://api.dxrating.net/api/admin/administrators/target-id/role-history')
    expect(requests[1]?.url).toContain('cursor=opaque-page')
    expect(requests[1]?.url).toContain('limit=25')
    expect(requests[2]).toMatchObject({ method: 'POST' })
    expect(requests[2]?.url).toBe('https://api.dxrating.net/api/admin/administrators/target-id/grant')
    await expect(requests[2]?.clone().json()).resolves.toEqual({ reason: 'Operational coverage' })
    expect(requests[3]).toMatchObject({ method: 'POST' })
    expect(requests[3]?.url).toBe('https://api.dxrating.net/api/admin/administrators/target-id/revoke')
    await expect(requests[3]?.clone().json()).resolves.toEqual({ reason: 'Operational coverage' })
    for (const request of requests) {
      expect(request.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
    }
  })

  it('serializes user search, detail, history, ban, and unban only under the private admin prefix', async () => {
    const requests: Request[] = []
    const activeState = {
      status: 'permanent' as const,
      stateVersion: '1',
      reason: 'Private moderation reason',
      actorUserId: 'administrator-id',
      banStartedAt: '2026-08-24T12:00:00.000Z',
      expiresAt: null,
      evaluatedAt: '2026-08-24T12:00:00.000Z',
    }
    const banEvent = {
      id: '1',
      subjectUserId: 'target-id',
      actorUserId: 'administrator-id',
      previousEventId: null,
      action: 'ban' as const,
      kind: 'permanent' as const,
      reason: 'Private moderation reason',
      banStartedAt: '2026-08-24T12:00:00.000Z',
      expiresAt: null,
      createdAt: '2026-08-24T12:00:00.000Z',
    }
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const captured = request as Request
      requests.push(captured)
      if (captured.url.endsWith('/users/search')) return jsonResponse({ items: [], nextCursor: null })
      if (captured.url.endsWith('/ban-history')) return jsonResponse({ items: [banEvent], nextCursor: null })
      if (captured.url.endsWith('/ban')) return jsonResponse({ state: activeState, event: banEvent })
      if (captured.url.endsWith('/unban')) {
        return jsonResponse({
          state: {
            status: 'unbanned',
            stateVersion: '2',
            reason: null,
            actorUserId: 'administrator-id',
            banStartedAt: null,
            expiresAt: null,
            evaluatedAt: '2026-08-24T13:00:00.000Z',
          },
          event: {
            id: '2',
            subjectUserId: 'target-id',
            actorUserId: 'administrator-id',
            previousEventId: '1',
            action: 'unban',
            kind: null,
            reason: null,
            banStartedAt: null,
            expiresAt: null,
            createdAt: '2026-08-24T13:00:00.000Z',
          },
        })
      }
      return jsonResponse({
        userId: 'target-id',
        displayName: 'Target User',
        email: 'target@example.com',
        emailVerified: false,
        effectiveRole: 'user',
        banState: activeState,
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await client.searchUsers({ body: { displayName: 'Target', activeBan: true, limit: 25 } })
    await client.getUserModerationDetail({ params: { userId: 'target-id' } })
    await client.listUserBanHistory({
      params: { userId: 'target-id' },
      query: { cursor: 'opaque_page', limit: 25 },
    })
    await client.banUser({
      params: { userId: 'target-id' },
      body: { expectedStateVersion: null, kind: 'permanent', reason: 'Private moderation reason' },
    })
    await client.unbanUser({
      params: { userId: 'target-id' },
      body: { expectedStateVersion: '1' },
    })

    expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
      ['POST', '/api/admin/users/search'],
      ['GET', '/api/admin/users/target-id'],
      ['GET', '/api/admin/users/target-id/ban-history'],
      ['POST', '/api/admin/users/target-id/ban'],
      ['POST', '/api/admin/users/target-id/unban'],
    ])
    expect(requests[2]?.url).toContain('cursor=opaque_page')
    expect(requests[2]?.url).toContain('limit=25')
    await expect(requests[0]?.clone().json()).resolves.toEqual({
      displayName: 'Target',
      activeBan: true,
      limit: 25,
    })
    await expect(requests[3]?.clone().json()).resolves.toEqual({
      expectedStateVersion: null,
      kind: 'permanent',
      reason: 'Private moderation reason',
    })
    await expect(requests[4]?.clone().json()).resolves.toEqual({ expectedStateVersion: '1' })
    for (const request of requests) {
      expect(request.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
    }
  })

  it('uses the private prefix, global compatibility header, and included cookie credentials', async () => {
    let capturedRequest: Request | undefined
    let capturedInit: RequestInit | undefined
    const fetch = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = request as Request
      capturedInit = init
      return jsonResponse(bootstrapOutput)
    })
    const onClientCompatible = vi.fn()
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net/',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
      onClientCompatible,
    })

    await expect(client.bootstrap()).resolves.toEqual(bootstrapOutput)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(capturedRequest?.url).toBe('https://api.dxrating.net/api/admin/bootstrap')
    expect(capturedRequest?.method).toBe('GET')
    expect(capturedRequest?.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
    expect(capturedInit?.credentials).toBe('include')
    expect(onClientCompatible).toHaveBeenCalledOnce()
  })

  it('does not allow runtime input to replace the transport compatibility header', async () => {
    let capturedRequest: Request | undefined
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      capturedRequest = request as Request
      return jsonResponse({ completed: true, expiresAt: '2026-08-24T12:10:00.000Z' })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await (client.completePrimaryAuthPassword as (input: unknown) => Promise<unknown>)({
      body: { password: 'correct horse battery staple' },
      headers: { [ADMIN_CONTRACT_HEADER]: `sha256:${'0'.repeat(64)}` },
    })

    expect(capturedRequest?.headers.get(ADMIN_CONTRACT_HEADER)).toBe(ADMIN_CONTRACT_COMPATIBILITY_ID)
  })

  it('propagates request cancellation to the injected fetch implementation', async () => {
    let capturedSignal: AbortSignal | undefined
    const fetch = vi.fn((request: RequestInfo | URL) => {
      capturedSignal = (request as Request).signal
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => reject(capturedSignal?.reason), { once: true })
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const controller = new AbortController()

    const request = client.bootstrap(undefined, { signal: controller.signal })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    controller.abort(new DOMException('cancelled', 'AbortError'))

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(capturedSignal?.aborted).toBe(true)
  })

  it('preserves a custom abort reason without branding or retrying it as a network failure', async () => {
    let capturedSignal: AbortSignal | undefined
    const fetch = vi.fn((request: RequestInfo | URL) => {
      capturedSignal = (request as Request).signal
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => reject(capturedSignal?.reason), { once: true })
      })
    })
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
    })
    const controller = new AbortController()
    const reason = new Error('route changed')

    const request = client.bootstrap(undefined, { signal: controller.signal })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    controller.abort(reason)

    await expect(request).rejects.toBe(reason)
    expect(isAdminNetworkError(reason)).toBe(false)
    expect(shouldRetryAdminRead(0, reason)).toBe(false)
  })

  it('rejects a raw typed mismatch before decoding a feature DTO', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          defined: true,
          code: 'ADMIN_CLIENT_INCOMPATIBLE',
          status: 409,
          message: 'The administrator client and backend contracts do not match',
          data: {
            requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
            expected: `sha256:${'f'.repeat(64)}`,
            received: ADMIN_CONTRACT_COMPATIBILITY_ID,
          },
        },
        { status: 409 },
      ),
    )
    const onClientCompatible = vi.fn()
    const onClientIncompatible = vi.fn()
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: fetch as unknown as typeof globalThis.fetch,
      mode: 'production',
      onClientCompatible,
      onClientIncompatible,
    })

    await expect(client.primaryAuthStatus()).rejects.toSatisfy(isAdminClientIncompatibleError)
    expect(onClientIncompatible).toHaveBeenCalledOnce()
    expect(onClientCompatible).not.toHaveBeenCalled()
  })

  it('brands failures raised at the fetch boundary without hiding cancellation', async () => {
    const { client } = createAdminDataClient({
      backendOrigin: 'https://api.dxrating.net',
      fetch: vi.fn(async () => {
        throw new TypeError('browser fetch detail')
      }) as unknown as typeof globalThis.fetch,
      mode: 'production',
    })

    await expect(client.bootstrap()).rejects.toSatisfy(isAdminNetworkError)
  })

  it('validates explicitly injected origins with the selected build mode', () => {
    expect(() =>
      createAdminDataClient({
        backendOrigin: 'http://localhost:3000',
        fetch: vi.fn() as unknown as typeof globalThis.fetch,
        mode: 'production',
      }),
    ).toThrow('VITE_BACKEND_URL must use HTTPS outside development and test')
    expect(() =>
      createAdminDataClient({
        backendOrigin: 'https://api.dxrating.net/admin',
        fetch: vi.fn() as unknown as typeof globalThis.fetch,
        mode: 'test',
      }),
    ).toThrow('VITE_BACKEND_URL must be an exact HTTP or HTTPS origin')
    expect(() =>
      createAdminDataClient({
        backendOrigin: ' ',
        fetch: vi.fn() as unknown as typeof globalThis.fetch,
        mode: 'test',
      }),
    ).toThrow('VITE_BACKEND_URL must be an exact HTTP or HTTPS origin')
  })
})