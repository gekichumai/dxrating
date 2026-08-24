import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createAdminDataClient } from '../data/admin-client'
import { AdminDataProvider } from '../data/admin-data-context'
import { createAdminTestQueryClient } from '../data/query-client'
import { adminQueryKeys } from '../data/query-keys'
import { TranslationProvider } from '../i18n'
import {
  AdminPrimaryAuthResult,
  readAdminPrimaryAuthResultHint,
  stripAdminPrimaryAuthResultQuery,
  type AdminPrimaryAuthResultLabels,
} from './admin-primary-auth-result'

const labels: AdminPrimaryAuthResultLabels = {
  checkingDescription: 'Checking the server-validated window.',
  checkingTitle: 'Checking verification',
  continue: 'Return to admin',
  failureDescription: 'Identity verification was not completed.',
  failureTitle: 'Verification incomplete',
  retry: 'Check again',
  successDescription: 'Your recent-authentication window is active.',
  successTitle: 'Identity verified',
}

const renderResult = ({
  fetch,
  search,
  stripQuery = vi.fn(),
}: {
  readonly fetch: typeof globalThis.fetch
  readonly search: string
  readonly stripQuery?: () => void
}) => {
  const data = createAdminDataClient({
    backendOrigin: 'https://api.dxrating.test',
    fetch,
    mode: 'test',
  })
  const queryClient = createAdminTestQueryClient()
  const rendered = render(
    <TranslationProvider>
      <MantineProvider>
        <QueryClientProvider client={queryClient}>
          <AdminDataProvider value={data}>
            <AdminPrimaryAuthResult
              labels={labels}
              onContinue={() => undefined}
              search={search}
              stripQuery={stripQuery}
            />
          </AdminDataProvider>
        </QueryClientProvider>
      </MantineProvider>
    </TranslationProvider>,
  )
  return { ...rendered, queryClient, stripQuery }
}

describe('administrator primary-authentication result helpers', () => {
  it('treats only the exact success value as a success hint', () => {
    expect(readAdminPrimaryAuthResultHint('?status=success')).toBe('success')
    expect(readAdminPrimaryAuthResultHint('?status=failure')).toBe('failure')
    expect(readAdminPrimaryAuthResultHint('?status=SUCCESS')).toBe('failure')
    expect(readAdminPrimaryAuthResultHint('?status=successish')).toBe('failure')
    expect(readAdminPrimaryAuthResultHint('?code=secret')).toBe('failure')
  })

  it('removes the entire query while retaining the route and hash', () => {
    const replaceState = vi.fn()
    stripAdminPrimaryAuthResultQuery({
      hash: '#result',
      history: { replaceState, state: { safe: true } },
      pathname: '/primary-auth/result',
    })

    expect(replaceState).toHaveBeenCalledWith({ safe: true }, '', '/primary-auth/result#result')
  })
})

describe('administrator primary-authentication result', () => {
  it('strips callback values and verifies a success hint against fresh server status', async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
    const fetch = vi.fn(async () => Response.json({ active: true, expiresAt })) as unknown as typeof globalThis.fetch
    const { queryClient, stripQuery } = renderResult({
      fetch,
      search: '?status=success&code=provider-secret&state=oauth-secret',
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Identity verified' })).toBeTruthy()
    expect(stripQuery).toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(adminQueryKeys.primaryAuth.status())).toEqual({ active: true, expiresAt })
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toMatch(/provider-secret|oauth-secret/)
  })

  it('rejects a forged success hint when the server window is inactive', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ active: false, expiresAt: null }),
    ) as unknown as typeof globalThis.fetch
    renderResult({ fetch, search: '?status=success' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Verification incomplete' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Identity verification was not completed.')
  })

  it('does not contact the status endpoint for a failure hint until the user retries', async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
    const fetch = vi.fn(async () => Response.json({ active: true, expiresAt })) as unknown as typeof globalThis.fetch
    const user = userEvent.setup()
    renderResult({ fetch, search: '?status=failure&error_description=provider-controlled-copy' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Verification incomplete' })).toBeTruthy()
    expect(screen.queryByText('provider-controlled-copy')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Check again' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Identity verified' })).toBeTruthy()
    expect(fetch).toHaveBeenCalledOnce()
  })
})