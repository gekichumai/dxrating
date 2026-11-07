import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
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
      vi.fn(async () => Response.json({ code: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 })),
    )
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('No access')
  })
})