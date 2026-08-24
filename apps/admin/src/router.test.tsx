import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { translate } from './i18n'
import { ADMIN_DESTINATIONS } from './navigation'
import { renderAdminApp } from './test/render-admin-app'

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
    await renderAdminApp('/sign-in')

    expect(await screen.findByRole('heading', { level: 1, name: translate('signIn.title') })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: translate('nav.primary') })).toBeNull()
    expect(screen.getByRole('textbox', { name: translate('signIn.email') })).toBeTruthy()
  })

  it('renders the dedicated not-found recovery state', async () => {
    await renderAdminApp('/missing-admin-destination')

    expect(await screen.findByRole('heading', { level: 1, name: translate('notFound.title') })).toBeTruthy()
    expect(screen.getByRole('link', { name: translate('actions.backToDashboard') }).getAttribute('href')).toBe('/')
  })
})