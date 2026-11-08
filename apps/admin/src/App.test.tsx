import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const mount = (client = new QueryClient()) =>
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </MantineProvider>,
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
})

describe('admin shell', () => {
  it('shows the principal the admin API returns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          type: 'human',
          id: 'owner@example.invalid',
          actor: 'human:owner@example.invalid',
          scopes: ['*'],
        }),
      ),
    )
    mount()
    expect(await screen.findByText('human:owner@example.invalid')).toBeTruthy()
  })

  it('shows no access when the admin API refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ defined: false, code: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 })),
    )
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('No access')
  })

  it('says the API is unavailable, not that access was denied, when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ defined: false, code: 'INTERNAL_SERVER_ERROR', message: 'x' }, { status: 500 }),
      ),
    )
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('Admin API unavailable')
  })

  it('stops showing the principal when a refetch is denied', async () => {
    const principal = {
      type: 'human',
      id: 'owner@example.invalid',
      actor: 'human:owner@example.invalid',
      scopes: ['*'],
    }
    const empty: Record<string, unknown> = {
      '/api/announcements': { announcements: [] },
      '/api/catalog/overview': {
        channel: 'production-v1',
        observedAt: '2026-11-07T00:00:00.000Z',
        current: null,
        latestChange: null,
        sources: [],
        failures: { recorded: false, note: 'not recorded' },
      },
    }
    const fetchMock = vi.fn(async (input: Request | string) => {
      const path = new URL(input instanceof Request ? input.url : input, 'http://admin.test').pathname
      return Response.json(empty[path] ?? principal)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    mount(client)
    expect(await screen.findByText('human:owner@example.invalid')).toBeTruthy()
    fetchMock.mockImplementation(async () =>
      Response.json({ defined: false, code: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 }),
    )
    await act(() => client.refetchQueries())
    expect((await screen.findByText('No access')).closest('[role=alert]')).toBeTruthy()
    expect(screen.queryByText('human:owner@example.invalid')).toBeNull()
    expect(screen.queryByText('owner@example.invalid')).toBeNull()
  })

  it('shows only the views the principal has scopes for, and opens the one in the hash', async () => {
    window.location.hash = '#publications'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        const path = new URL(input instanceof Request ? input.url : input, 'http://admin.test').pathname
        if (path === '/api/catalog/publications')
          return Response.json({ channel: 'production-v1', channels: [], publications: [], nextBefore: null })
        return Response.json({ type: 'agent', id: 'reader', actor: 'agent:reader', scopes: ['catalog:read'] })
      }),
    )
    mount()
    expect(await screen.findByRole('heading', { name: 'Publications' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Publications' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('link', { name: 'Announcements' })).toBeNull()
    expect(screen.queryByText('Signed in')).toBeNull()
  })
})