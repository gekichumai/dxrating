import { ADMIN_CONTRACT_COMPATIBILITY_ID } from '@gekichumai/admin-contract'
import { modals } from '@mantine/modals'
import { notifications, notificationsStore } from '@mantine/notifications'
import { ORPCError } from '@orpc/client'
import { act, render, screen } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { ProtectedAdminProviders } from '../components/protected-admin-providers'
import { createAdminClientIncompatibleError } from './compatibility'
import { createAdminRuntime } from './admin-runtime'
import { useAdminData } from './admin-data-context'
import { createAdminTestQueryClient } from './query-client'
import { adminQueryKeys } from './query-keys'
import { adminBootstrapQueryOptions } from './query-options'

const mismatch = {
  requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
  expected: `sha256:${'f'.repeat(64)}`,
  received: ADMIN_CONTRACT_COMPATIBILITY_ID,
}

const mismatchResponse = () =>
  Response.json(
    {
      defined: true,
      code: 'ADMIN_CLIENT_INCOMPATIBLE',
      status: 409,
      message: 'safe compatibility message',
      data: mismatch,
    },
    { status: 409 },
  )

const authorizationError = (code: 'FORBIDDEN' | 'FRESH_LOGIN_REQUIRED' | 'UNAUTHENTICATED', status: number) =>
  new ORPCError(code, {
    data: { requestId: null },
    defined: true,
    message: 'raw authorization detail',
    status,
  })

const authenticateRuntime = (runtime: ReturnType<typeof createAdminRuntime>) => {
  const checkId = runtime.auth.beginAuthorizationCheck()
  if (checkId === undefined) throw new Error('Administrator authorization check did not start')
  expect(
    runtime.auth.markAuthenticated(
      {
        userId: 'administrator-id',
        effectiveRole: 'admin',
        capabilities: {
          canModerateUsers: true,
          canModerateAdministrators: false,
          canManageAdministrators: false,
        },
      },
      checkId,
    ),
  ).toBe(true)
}

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

const createMemoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

const BootstrapProbe = () => {
  const data = useAdminData()
  const query = useQuery(adminBootstrapQueryOptions(data))
  return <div>{query.data?.principal.userId ?? 'Protected administrator feature loading'}</div>
}

describe('administrator data runtime', () => {
  it('blocks feature decoding, unmounts protected providers, and clears cache on a transport mismatch', async () => {
    const runtime = createAdminRuntime({
      dataClient: {
        backendOrigin: 'https://api.dxrating.net',
        fetch: vi.fn(async () => mismatchResponse()) as unknown as typeof globalThis.fetch,
        mode: 'production',
      },
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    runtime.queryClient.setQueryData(['admin', 'previously-safe'], {
      privileged: true,
    })

    render(
      <AdminProviders runtime={runtime}>
        <BootstrapProbe />
      </AdminProviders>,
    )

    expect(await screen.findByText('Admin update available')).toBeTruthy()
    expect(screen.queryByText('Protected administrator feature loading')).toBeNull()
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(runtime.compatibility.getState().status).toBe('reload_available')
  })

  it.each(['query', 'mutation'] as const)('catches a mismatch delivered by the central %s cache', async (kind) => {
    const runtime = createAdminRuntime({
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    runtime.queryClient.setQueryData(['admin', 'unsafe'], {
      privileged: true,
    })
    const error = createAdminClientIncompatibleError(mismatch)

    if (kind === 'query') {
      await expect(
        runtime.queryClient.fetchQuery({
          queryFn: async () => {
            throw error
          },
          queryKey: ['admin', 'mismatched-query'],
          retry: false,
        }),
      ).rejects.toBe(error)
    } else {
      const mutation = runtime.queryClient.getMutationCache().build(runtime.queryClient, {
        mutationFn: async () => {
          throw error
        },
        retry: false,
      })
      await expect(mutation.execute(undefined)).rejects.toBe(error)
    }

    await vi.waitFor(() => expect(runtime.compatibility.getState().status).toBe('reload_available'))
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(runtime.queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  it('cancels in-flight reads before clearing protected cache entries', async () => {
    const runtime = createAdminRuntime({
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    let requestSignal: AbortSignal | undefined
    const request = runtime.queryClient
      .fetchQuery({
        queryFn: ({ signal }) => {
          requestSignal = signal
          return new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
          })
        },
        queryKey: ['admin', 'in-flight'],
      })
      .catch((error: unknown) => error)
    await vi.waitFor(() => expect(requestSignal).toBeDefined())

    await runtime.compatibility.handleError(createAdminClientIncompatibleError(mismatch))
    await request

    expect(requestSignal?.aborted).toBe(true)
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('still clears protected caches and fails closed if query cancellation reports a failure', async () => {
    const runtime = createAdminRuntime({
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    runtime.queryClient.setQueryData(['admin', 'unsafe-after-cancel-failure'], {
      privileged: true,
    })
    vi.spyOn(runtime.queryClient, 'cancelQueries').mockRejectedValueOnce(new Error('cancellation failed'))

    await runtime.compatibility.handleError(createAdminClientIncompatibleError(mismatch))

    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(runtime.compatibility.getState()).toMatchObject({
      reason: 'cache_clear_failed',
      status: 'update_required',
    })
  })

  it('shares one cancel-then-finally-clear operation across authorization and compatibility failures', async () => {
    const runtime = createAdminRuntime({
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    authenticateRuntime(runtime)
    runtime.queryClient.setQueryData(adminQueryKeys.users.detail('shared-clear-user'), { private: true })
    const cancellation = deferred()
    const cancelQueries = vi.spyOn(runtime.queryClient, 'cancelQueries').mockReturnValue(cancellation.promise)

    runtime.auth.handleFeatureError(authorizationError('UNAUTHENTICATED', 401))
    const compatibility = runtime.compatibility.handleError(createAdminClientIncompatibleError(mismatch))

    await vi.waitFor(() => expect(cancelQueries).toHaveBeenCalledOnce())
    cancellation.resolve()
    await compatibility
    await vi.waitFor(() =>
      expect(runtime.auth.getState()).toEqual({ status: 'unauthenticated', reason: 'expired-or-revoked' }),
    )

    expect(cancelQueries).toHaveBeenCalledOnce()
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(runtime.queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(runtime.compatibility.getState().status).toBe('reload_available')
  })

  it.each(['query', 'mutation'] as const)(
    'rechecks bootstrap instead of treating a feature %s denial as privilege loss',
    async (kind) => {
      const runtime = createAdminRuntime({
        queryClientFactory: createAdminTestQueryClient,
        reload: vi.fn(),
        storage: createMemoryStorage(),
      })
      authenticateRuntime(runtime)
      runtime.queryClient.setQueryData(adminQueryKeys.users.detail('retained-user'), { private: true })
      const error = authorizationError('FORBIDDEN', 403)

      if (kind === 'query') {
        await expect(
          runtime.queryClient.fetchQuery({
            queryFn: async () => {
              throw error
            },
            queryKey: adminQueryKeys.users.detail('forbidden-target'),
            retry: false,
          }),
        ).rejects.toBe(error)
      } else {
        const mutation = runtime.queryClient.getMutationCache().build(runtime.queryClient, {
          mutationFn: async () => {
            throw error
          },
          retry: false,
        })
        await expect(mutation.execute(undefined)).rejects.toBe(error)
      }

      const pending = runtime.auth.getState()
      expect(pending).toMatchObject({ status: 'pending', phase: 'authorization' })
      expect(runtime.queryClient.getQueryData(adminQueryKeys.users.detail('retained-user'))).toEqual({ private: true })

      expect(
        runtime.auth.markAuthenticated(
          {
            userId: 'administrator-id',
            effectiveRole: 'admin',
            capabilities: {
              canModerateUsers: true,
              canModerateAdministrators: false,
              canManageAdministrators: false,
            },
          },
          pending.status === 'pending' ? pending.checkId : -1,
        ),
      ).toBe(true)
      expect(runtime.auth.getState().status).toBe('authenticated')
      expect(runtime.queryClient.getQueryData(adminQueryKeys.users.detail('retained-user'))).toEqual({ private: true })
    },
  )

  it('treats a bootstrap denial as authoritative and purges protected state', async () => {
    const runtime = createAdminRuntime({
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    authenticateRuntime(runtime)
    runtime.queryClient.setQueryData(adminQueryKeys.users.detail('private-user'), { private: true })
    const error = authorizationError('FORBIDDEN', 403)

    await expect(
      runtime.queryClient.fetchQuery({
        queryFn: async () => {
          throw error
        },
        queryKey: adminQueryKeys.bootstrap(),
        retry: false,
      }),
    ).rejects.toBe(error)

    await vi.waitFor(() => expect(runtime.auth.getState()).toEqual({ status: 'forbidden' }))
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(runtime.queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  it.each([
    ['UNAUTHENTICATED', 401, { status: 'unauthenticated', reason: 'expired-or-revoked' }],
    ['FRESH_LOGIN_REQUIRED', 401, { status: 'fresh-login-required' }],
  ] as const)('purges on a mutation %s response', async (code, status, terminal) => {
    const runtime = createAdminRuntime({
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    authenticateRuntime(runtime)
    runtime.queryClient.setQueryData(adminQueryKeys.comments.detail('sensitive-comment'), { private: true })
    const error = authorizationError(code, status)
    const mutation = runtime.queryClient.getMutationCache().build(runtime.queryClient, {
      mutationFn: async () => {
        throw error
      },
      retry: false,
    })

    await expect(mutation.execute(undefined)).rejects.toBe(error)
    await vi.waitFor(() => expect(runtime.auth.getState()).toEqual(terminal))
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(runtime.queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  it('purges protected overlay content and state with the protected workspace root', async () => {
    const runtime = createAdminRuntime({
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    const PortalProbe = () => {
      useEffect(() => {
        for (let index = 0; index < 5; index += 1) {
          notifications.show({
            id: `compatibility-notification-${index}`,
            message: `Protected notification content ${index}`,
          })
        }
        modals.open({
          children: <div>Protected modal content</div>,
          modalId: 'compatibility-modal',
          title: 'Protected modal',
        })
      }, [])
      return <div>Protected provider content</div>
    }
    render(
      <AdminProviders runtime={runtime}>
        <ProtectedAdminProviders>
          <PortalProbe />
        </ProtectedAdminProviders>
      </AdminProviders>,
    )
    expect(await screen.findByText('Protected notification content 0')).toBeTruthy()
    expect(await screen.findByText('Protected modal content')).toBeTruthy()
    expect(notificationsStore.getState().notifications).toHaveLength(4)
    expect(notificationsStore.getState().queue).toHaveLength(1)

    await act(async () => {
      await runtime.compatibility.handleError(createAdminClientIncompatibleError(mismatch))
    })

    expect(notificationsStore.getState().notifications).toHaveLength(0)
    expect(notificationsStore.getState().queue).toHaveLength(0)
    expect(screen.queryByText('Protected provider content')).toBeNull()
    expect(screen.queryAllByText(/Protected notification content/)).toHaveLength(0)
    expect(screen.queryByText('Protected modal content')).toBeNull()
  })
})