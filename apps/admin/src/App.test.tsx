import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const mount = (client = new QueryClient()) =>
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ defined: false, code: 'INTERNAL_SERVER_ERROR', message: 'x' }, { status: 500 })))
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('Admin API unavailable')
  })

  it('stops showing the principal when a refetch is denied', async () => {
    const principal = { type: 'human', id: 'owner@example.invalid', actor: 'human:owner@example.invalid', scopes: ['*'] }
    const fetchMock = vi.fn(async () => Response.json(principal))
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    mount(client)
    expect(await screen.findByText('human:owner@example.invalid')).toBeTruthy()
    fetchMock.mockImplementation(async () => Response.json({ defined: false, code: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 }))
    await act(() => client.refetchQueries())
    expect((await screen.findByRole('alert')).textContent).toContain('No access')
    expect(screen.queryByText('human:owner@example.invalid')).toBeNull()
    expect(screen.queryByText('owner@example.invalid')).toBeNull()
  })
})
