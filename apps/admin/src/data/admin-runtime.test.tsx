import { ADMIN_CONTRACT_COMPATIBILITY_ID } from '@gekichumai/admin-contract'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { act, render, screen } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { createAdminClientIncompatibleError } from './compatibility'
import { createAdminRuntime } from './admin-runtime'
import { useAdminData } from './admin-data-context'
import { createAdminTestQueryClient } from './query-client'
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
    runtime.queryClient.setQueryData(['admin', 'previously-safe'], { privileged: true })

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
    runtime.queryClient.setQueryData(['admin', 'unsafe'], { privileged: true })
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
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
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
    runtime.queryClient.setQueryData(['admin', 'unsafe-after-cancel-failure'], { privileged: true })
    vi.spyOn(runtime.queryClient, 'cancelQueries').mockRejectedValueOnce(new Error('cancellation failed'))

    await runtime.compatibility.handleError(createAdminClientIncompatibleError(mismatch))

    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(runtime.compatibility.getState()).toMatchObject({
      reason: 'cache_clear_failed',
      status: 'update_required',
    })
  })

  it('removes notification and modal portals with the protected provider subtree', async () => {
    const runtime = createAdminRuntime({
      queryClientFactory: createAdminTestQueryClient,
      reload: vi.fn(),
      storage: createMemoryStorage(),
    })
    const PortalProbe = () => {
      useEffect(() => {
        notifications.show({ id: 'compatibility-notification', message: 'Protected notification content' })
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
        <PortalProbe />
      </AdminProviders>,
    )
    expect(await screen.findByText('Protected notification content')).toBeTruthy()
    expect(await screen.findByText('Protected modal content')).toBeTruthy()

    await act(async () => {
      await runtime.compatibility.handleError(createAdminClientIncompatibleError(mismatch))
    })

    expect(screen.queryByText('Protected notification content')).toBeNull()
    expect(screen.queryByText('Protected modal content')).toBeNull()
    expect(screen.queryByText('Protected provider content')).toBeNull()
    notifications.hide('compatibility-notification')
    modals.close('compatibility-modal')
  })
})