import { ADMIN_CONTRACT_COMPATIBILITY_ID } from '@gekichumai/admin-contract'
import { ORPCError } from '@orpc/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAdminRuntime, type AdminRuntime } from '../data/admin-runtime'
import { createAdminTestQueryClient } from '../data/query-client'
import { adminQueryKeys } from '../data/query-keys'
import type { AdminAuthClient, AdminSessionSnapshot } from './admin-auth-client'
import {
  useAdminAuth,
  useAdminAuthActions,
  type AdminAuthActions,
  type AdminAuthSnapshot,
  type AdminPrincipal,
} from './admin-auth-context'
import { AdminAuthorizationProvider } from './admin-authorization-provider'

const principal = (effectiveRole: 'admin' | 'super_admin' = 'admin', userId = 'administrator-id'): AdminPrincipal => ({
  userId,
  effectiveRole,
  capabilities: {
    canModerateUsers: true,
    canModerateAdministrators: effectiveRole === 'super_admin',
    canManageAdministrators: effectiveRole === 'super_admin',
  },
})

const bootstrapResponse = (value: AdminPrincipal) =>
  Response.json({
    contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
    ready: true,
    principal: value,
  })

const adminErrorResponse = (code: 'FORBIDDEN' | 'INTERNAL_SERVER_ERROR', status: number) =>
  Response.json(
    {
      defined: true,
      code,
      status,
      message: 'safe administrator error',
      data: { requestId: null },
    },
    { status },
  )

const featureForbidden = () =>
  new ORPCError('FORBIDDEN', {
    data: { requestId: null },
    defined: true,
    message: 'target-specific denial',
    status: 403,
  })

const sessionIdentity = (sessionId = 'session-id', userId = 'administrator-id') => ({
  sessionId,
  user: {
    email: `${userId}@example.com`,
    id: userId,
    image: null,
    name: 'Administrator',
  },
})

const authenticatedSession = (
  sessionId = 'session-id',
  userId = 'administrator-id',
  refetch: AdminSessionSnapshot['refetch'] = vi.fn(async () => undefined),
): AdminSessionSnapshot => ({
  data: sessionIdentity(sessionId, userId),
  error: null,
  isPending: false,
  isRefetching: false,
  refetch,
})

const pendingSession = (
  refetch: AdminSessionSnapshot['refetch'] = vi.fn(async () => undefined),
): AdminSessionSnapshot => ({
  data: null,
  error: null,
  isPending: true,
  isRefetching: false,
  refetch,
})

const createRuntime = (fetch: typeof globalThis.fetch): AdminRuntime =>
  createAdminRuntime({
    dataClient: {
      backendOrigin: 'https://api.dxrating.test',
      fetch,
      mode: 'test',
    },
    queryClientFactory: createAdminTestQueryClient,
    reload: vi.fn(),
    storage: null,
  })

const createAuthClient = ({
  readSession,
  signOut = vi.fn(async () => ({ ok: true as const, data: null })),
}: {
  readonly readSession: () => AdminSessionSnapshot
  readonly signOut?: AdminAuthClient['signOut']
}): AdminAuthClient => ({
  beginSocialSignIn: vi.fn(),
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut,
  useSession: readSession,
})

const renderAuthorization = ({
  authClient,
  runtime,
}: {
  readonly authClient: AdminAuthClient
  readonly runtime: AdminRuntime
}) => {
  let observedActions: AdminAuthActions | undefined
  let observedAuth: AdminAuthSnapshot | undefined

  const Probe = () => {
    observedAuth = useAdminAuth()
    observedActions = useAdminAuthActions()
    return null
  }
  const tree = () => (
    <QueryClientProvider client={runtime.queryClient}>
      <AdminAuthorizationProvider authClient={authClient} runtime={runtime}>
        <Probe />
      </AdminAuthorizationProvider>
    </QueryClientProvider>
  )
  const rendered = render(tree())

  return {
    actions: () => {
      if (!observedActions) throw new Error('Administrator auth actions were not published')
      return observedActions
    },
    auth: () => {
      if (!observedAuth) throw new Error('Administrator auth state was not published')
      return observedAuth
    },
    rerender: () => rendered.rerender(tree()),
    unmount: rendered.unmount,
  }
}

const waitForPrincipal = async (runtime: AdminRuntime, expected: AdminPrincipal) =>
  vi.waitFor(() => expect(runtime.auth.getState()).toEqual({ status: 'authenticated', principal: expected }))

describe('administrator authorization provider', () => {
  it('moves an authenticated session through bootstrap before publishing its principal', async () => {
    let session = pendingSession()
    const fetch = vi.fn(async () => bootstrapResponse(principal())) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    const rendered = renderAuthorization({
      authClient: createAuthClient({ readSession: () => session }),
      runtime,
    })

    expect(rendered.auth()).toMatchObject({ status: 'pending', phase: 'session' })
    expect(fetch).not.toHaveBeenCalled()

    session = authenticatedSession()
    rendered.rerender()

    await waitForPrincipal(runtime, principal())
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('fails closed and clears cache when bootstrap proves the session is an ordinary user', async () => {
    const fetch = vi.fn(async () => adminErrorResponse('FORBIDDEN', 403)) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    runtime.queryClient.setQueryData(adminQueryKeys.users.detail('private-user'), { private: true })
    const cancelQueries = vi.spyOn(runtime.queryClient, 'cancelQueries')

    renderAuthorization({
      authClient: createAuthClient({ readSession: () => authenticatedSession() }),
      runtime,
    })

    await vi.waitFor(() => expect(runtime.auth.getState()).toEqual({ status: 'forbidden' }))
    expect(cancelQueries).toHaveBeenCalledOnce()
    expect(runtime.queryClient.getQueryData(adminQueryKeys.users.detail('private-user'))).toBeUndefined()
  })

  it.each([
    ['missing', { data: null, error: null }],
    ['expired', { data: null, error: { kind: 'session-expired', operation: 'session' } }],
  ] as const)('purges protected cache when an authenticated session becomes %s', async (_label, loss) => {
    let session = authenticatedSession()
    const fetch = vi.fn(async () => bootstrapResponse(principal())) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    const rendered = renderAuthorization({
      authClient: createAuthClient({ readSession: () => session }),
      runtime,
    })
    await waitForPrincipal(runtime, principal())
    runtime.queryClient.setQueryData(adminQueryKeys.comments.detail('private-comment'), { private: true })

    session = {
      ...loss,
      isPending: false,
      isRefetching: false,
      refetch: vi.fn(async () => undefined),
    }
    rendered.rerender()

    await vi.waitFor(() =>
      expect(runtime.auth.getState()).toEqual({ status: 'unauthenticated', reason: 'expired-or-revoked' }),
    )
    expect(runtime.queryClient.getQueryData(adminQueryKeys.comments.detail('private-comment'))).toBeUndefined()
  })

  it('applies a capability expansion from a successful bootstrap refresh without purging cache', async () => {
    let nextPrincipal = principal()
    const fetch = vi.fn(async () => bootstrapResponse(nextPrincipal)) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    renderAuthorization({
      authClient: createAuthClient({ readSession: () => authenticatedSession() }),
      runtime,
    })
    await waitForPrincipal(runtime, nextPrincipal)
    runtime.queryClient.setQueryData(adminQueryKeys.users.detail('retained-user'), { private: true })
    const cancelQueries = vi.spyOn(runtime.queryClient, 'cancelQueries')

    nextPrincipal = principal('super_admin')
    await act(async () => {
      await runtime.queryClient.refetchQueries({ exact: true, queryKey: adminQueryKeys.bootstrap() })
    })

    await waitForPrincipal(runtime, nextPrincipal)
    expect(cancelQueries).not.toHaveBeenCalled()
    expect(runtime.queryClient.getQueryData(adminQueryKeys.users.detail('retained-user'))).toEqual({ private: true })
  })

  it('purges before publishing a capability reduction from a successful bootstrap refresh', async () => {
    let nextPrincipal = principal('super_admin')
    const fetch = vi.fn(async () => bootstrapResponse(nextPrincipal)) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    renderAuthorization({
      authClient: createAuthClient({ readSession: () => authenticatedSession() }),
      runtime,
    })
    await waitForPrincipal(runtime, nextPrincipal)
    runtime.queryClient.setQueryData(adminQueryKeys.users.detail('removed-user'), { private: true })
    const cancelQueries = vi.spyOn(runtime.queryClient, 'cancelQueries')

    nextPrincipal = principal('admin')
    await act(async () => {
      await runtime.queryClient.refetchQueries({ exact: true, queryKey: adminQueryKeys.bootstrap() })
    })

    await waitForPrincipal(runtime, nextPrincipal)
    expect(cancelQueries).toHaveBeenCalledOnce()
    expect(runtime.queryClient.getQueryData(adminQueryKeys.users.detail('removed-user'))).toBeUndefined()
  })

  it('retries an unavailable bootstrap and publishes the recovered principal', async () => {
    let available = false
    const fetch = vi.fn(async () =>
      available ? bootstrapResponse(principal()) : adminErrorResponse('INTERNAL_SERVER_ERROR', 500),
    ) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    const rendered = renderAuthorization({
      authClient: createAuthClient({ readSession: () => authenticatedSession() }),
      runtime,
    })
    await vi.waitFor(() => expect(runtime.auth.getState()).toEqual({ status: 'unavailable', source: 'authorization' }))

    available = true
    await act(async () => rendered.actions().retry())

    await waitForPrincipal(runtime, principal())
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('rechecks authorization when an unavailable session refetch recovers', async () => {
    let session!: AdminSessionSnapshot
    const refetch = vi.fn(async () => {
      session = authenticatedSession('recovered-session', 'administrator-id', refetch)
    })
    session = {
      data: null,
      error: { kind: 'unavailable', operation: 'session' },
      isPending: false,
      isRefetching: false,
      refetch,
    }
    const fetch = vi.fn(async () => bootstrapResponse(principal())) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    const rendered = renderAuthorization({
      authClient: createAuthClient({ readSession: () => session }),
      runtime,
    })
    await vi.waitFor(() => expect(runtime.auth.getState()).toEqual({ status: 'unavailable', source: 'session' }))

    await act(async () => rendered.actions().retry())
    rendered.rerender()

    await waitForPrincipal(runtime, principal())
    expect(refetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    ['success', { ok: true as const, data: null }, { status: 'unauthenticated', reason: 'signed-out' }],
    [
      'failure',
      { ok: false as const, failure: { kind: 'unavailable' as const, operation: 'sign-out' as const } },
      { status: 'unavailable', source: 'sign-out' },
    ],
  ] as const)('purges before publishing sign-out %s', async (_label, result, expected) => {
    const fetch = vi.fn(async () => bootstrapResponse(principal())) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    const signOut = vi.fn(async () => result)
    const rendered = renderAuthorization({
      authClient: createAuthClient({ readSession: () => authenticatedSession(), signOut }),
      runtime,
    })
    await waitForPrincipal(runtime, principal())
    runtime.queryClient.setQueryData(adminQueryKeys.comments.detail('sign-out-comment'), { private: true })

    await act(async () => rendered.actions().signOut())

    expect(runtime.auth.getState()).toEqual(expected)
    expect(signOut).toHaveBeenCalledOnce()
    expect(runtime.queryClient.getQueryData(adminQueryKeys.comments.detail('sign-out-comment'))).toBeUndefined()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('rechecks bootstrap after a generic feature denial without purging retained data', async () => {
    const fetch = vi.fn(async () => bootstrapResponse(principal())) as unknown as typeof globalThis.fetch
    const runtime = createRuntime(fetch)
    renderAuthorization({
      authClient: createAuthClient({ readSession: () => authenticatedSession() }),
      runtime,
    })
    await waitForPrincipal(runtime, principal())
    runtime.queryClient.setQueryData(adminQueryKeys.users.detail('retained-user'), { private: true })

    expect(runtime.auth.handleFeatureError(featureForbidden())).toBe(true)

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await waitForPrincipal(runtime, principal())
    expect(runtime.queryClient.getQueryData(adminQueryKeys.users.detail('retained-user'))).toEqual({ private: true })
  })

  it('cancels stale bootstrap work and clears cache before authorizing a replacement session', async () => {
    let staleRequestStarted!: () => void
    const started = new Promise<void>((resolve) => {
      staleRequestStarted = resolve
    })
    let requestCount = 0
    const fetch = vi.fn((request: Request) => {
      requestCount += 1
      if (requestCount === 1) return Promise.resolve(bootstrapResponse(principal()))
      if (requestCount > 2) return Promise.resolve(bootstrapResponse(principal('admin', 'replacement-id')))

      staleRequestStarted()
      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
      })
    }) as unknown as typeof globalThis.fetch
    let session = authenticatedSession('first-session', 'administrator-id')
    const runtime = createRuntime(fetch)
    const rendered = renderAuthorization({
      authClient: createAuthClient({ readSession: () => session }),
      runtime,
    })
    await waitForPrincipal(runtime, principal())
    const cancelQueries = vi.spyOn(runtime.queryClient, 'cancelQueries')
    expect(runtime.auth.handleFeatureError(featureForbidden())).toBe(true)
    await started
    runtime.queryClient.setQueryData(adminQueryKeys.users.detail('first-account-user'), { private: true })

    session = authenticatedSession('replacement-session', 'replacement-id')
    rendered.rerender()

    await waitForPrincipal(runtime, principal('admin', 'replacement-id'))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(cancelQueries).toHaveBeenCalledOnce()
    expect(runtime.queryClient.getQueryData(adminQueryKeys.users.detail('first-account-user'))).toBeUndefined()
  })
})