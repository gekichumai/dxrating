import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { isAdminRecentAuthValid } from './auth/admin-recent-auth'
import { adminQueryKeys } from './data/query-keys'
import { translate } from './i18n'
import { ADMIN_DESTINATIONS } from './navigation'
import { createAdminTestRuntime, renderAdminApp } from './test/render-admin-app'

describe('administrator route tree', () => {
  it.each(ADMIN_DESTINATIONS)('resolves a direct navigation to $to', async (destination) => {
    await renderAdminApp(destination.to)

    expect(await screen.findByRole('heading', { level: 1, name: translate(destination.titleKey) })).toBeTruthy()
    expect(screen.getByRole('link', { name: translate(destination.labelKey) }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('navigation', { name: translate('breadcrumbs.label') })).toBeTruthy()
  })

  it('keeps sign-in outside the administrator shell', async () => {
    await renderAdminApp('/sign-in', { auth: { status: 'unauthenticated', reason: 'initial' } })

    expect(await screen.findByRole('heading', { level: 1, name: translate('signIn.title') })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: translate('nav.primary') })).toBeNull()
    expect(screen.getByRole('textbox', { name: translate('signIn.email') })).toBeTruthy()
    expect(screen.getByRole('button', { name: translate('signIn.provider.google') })).toBeTruthy()
    expect(screen.getByRole('button', { name: translate('signIn.provider.github') })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('redirects an already-authorized administrator away from sign-in', async () => {
    const rendered = await renderAdminApp('/sign-in')

    expect(await screen.findByRole('heading', { level: 1, name: translate('page.dashboard.title') })).toBeTruthy()
    expect(rendered.router.state.location.pathname).toBe('/')
  })

  it('shows only local generic copy for an OAuth callback failure', async () => {
    await renderAdminApp('/sign-in?oauth=failed&error=provider-secret-description', {
      auth: { status: 'unauthenticated', reason: 'initial' },
    })

    expect(await screen.findByText(translate('signIn.failure.oauthCallback'))).toBeTruthy()
    expect(screen.queryByText(/provider-secret-description/i)).toBeNull()
  })

  it('keeps the OAuth primary-auth result inside authorization but outside the workspace shell', async () => {
    await renderAdminApp('/primary-auth/result?status=success')

    expect(
      await screen.findByRole('heading', { level: 1, name: translate('primaryAuthResult.checking.title') }),
    ).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: translate('nav.primary') })).toBeNull()
  })

  it('preserves the verified recent-auth observation through in-app continuation', async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
    const runtime = createAdminTestRuntime({
      fetch: async () => Response.json({ active: true, expiresAt }),
    })
    const user = userEvent.setup()
    const rendered = await renderAdminApp('/primary-auth/result?status=success', { runtime })

    expect(
      await screen.findByRole('heading', { level: 1, name: translate('primaryAuthResult.success.title') }),
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: translate('primaryAuthResult.continue') }))

    expect(await screen.findByRole('heading', { level: 1, name: translate('page.dashboard.title') })).toBeTruthy()
    expect(rendered.router.state.location.pathname).toBe('/')
    const queryKey = adminQueryKeys.primaryAuth.status()
    expect(
      isAdminRecentAuthValid({
        observedAt: runtime.queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0,
        status: runtime.queryClient.getQueryData(queryKey),
      }),
    ).toBe(true)
  })

  it('redirects a missing session before the protected shell mounts', async () => {
    const rendered = await renderAdminApp('/charts', {
      auth: { status: 'unauthenticated', reason: 'expired-or-revoked' },
    })

    expect(await screen.findByRole('heading', { level: 1, name: translate('signIn.title') })).toBeTruthy()
    expect(rendered.router.state.location.pathname).toBe('/sign-in')
    expect(screen.queryByRole('navigation', { name: translate('nav.primary') })).toBeNull()
  })

  it.each([
    {
      auth: { status: 'pending', phase: 'authorization', checkId: 1 } as const,
      heading: translate('auth.pending.title'),
    },
    { auth: { status: 'forbidden' } as const, heading: translate('auth.forbidden.title') },
    {
      auth: { status: 'fresh-login-required' } as const,
      heading: translate('error.freshLoginRequired.title'),
    },
    {
      auth: { status: 'unavailable', source: 'authorization' } as const,
      heading: translate('auth.unavailable.title'),
    },
  ])('fails closed in the $auth.status authorization state', async ({ auth, heading }) => {
    await renderAdminApp('/charts', { auth })

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1, name: translate('page.charts.title') })).toBeNull()
    expect(screen.queryByRole('navigation', { name: translate('nav.primary') })).toBeNull()
  })

  it('renders the dedicated not-found recovery state', async () => {
    await renderAdminApp('/missing-admin-destination')

    expect(await screen.findByRole('heading', { level: 1, name: translate('notFound.title') })).toBeTruthy()
    expect(screen.getByRole('link', { name: translate('actions.backToDashboard') }).getAttribute('href')).toBe('/')
  })
})