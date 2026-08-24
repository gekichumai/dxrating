import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { translate } from '../i18n'
import { ADMIN_DESTINATIONS } from '../navigation'
import { renderAdminApp } from '../test/render-admin-app'
import { resolveEnvironmentLabel } from './admin-shell'

describe('administrator environment marker', () => {
  it('distinguishes production from named non-production builds', () => {
    expect(resolveEnvironmentLabel({ MODE: 'production' })).toBeUndefined()
    expect(resolveEnvironmentLabel({ MODE: 'preview', VITE_ADMIN_ENVIRONMENT: 'staging' })).toBe('staging')
    expect(resolveEnvironmentLabel({ MODE: 'development', VITE_ADMIN_ENVIRONMENT: '  ' })).toBe('development')
  })
})

describe('administrator application shell', () => {
  it('exposes keyboard-reachable navigation, page structure, and current-user controls', async () => {
    const user = userEvent.setup()
    await renderAdminApp('/')
    await screen.findByRole('heading', { level: 1, name: translate('page.dashboard.title') })

    const skipLink = screen.getByRole('link', { name: translate('shell.skipToContent') })
    skipLink.focus()
    expect(document.activeElement).toBe(skipLink)

    const navigation = screen.getByRole('navigation', { name: translate('nav.primary') })
    for (const destination of ADMIN_DESTINATIONS) {
      const link = within(navigation).getByRole('link', { name: translate(destination.labelKey) })
      link.focus()
      expect(document.activeElement).toBe(link)
      expect(link.getAttribute('href')).toBe(destination.to)
    }

    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    expect(document.querySelector('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])')).toBeNull()

    const menuButton = screen.getByRole('button', { name: translate('shell.currentUserMenu') })
    await user.click(menuButton)
    expect(await screen.findByText(translate('actions.signOut'))).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(menuButton)
  })

  it('provides labelled tablet navigation and color-scheme controls', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(max-width: 61.99em)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const user = userEvent.setup()
    await renderAdminApp('/charts')
    await screen.findByRole('heading', { level: 1, name: translate('page.charts.title') })

    const navigationButton = await screen.findByRole('button', { name: translate('shell.openNavigation') })
    expect(navigationButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('navigation', { name: translate('nav.primary') })).toBeNull()
    const hiddenNavigation = document.getElementById('admin-primary-navigation')
    expect(hiddenNavigation?.hasAttribute('inert')).toBe(true)
    expect(hiddenNavigation?.getAttribute('aria-hidden')).toBe('true')

    await user.click(navigationButton)
    expect(navigationButton.getAttribute('aria-expanded')).toBe('true')
    expect(navigationButton.getAttribute('aria-controls')).toBe('admin-primary-navigation')
    const navigation = await screen.findByRole('navigation', { name: translate('nav.primary') })
    expect(document.activeElement).toBe(within(navigation).getByRole('link', { name: translate('nav.dashboard') }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: translate('nav.primary') })).toBeNull()
    expect(document.activeElement).toBe(navigationButton)

    const schemeButton = screen.getByRole('button', { name: translate('shell.switchToDark') })
    fireEvent.click(schemeButton)
    expect(await screen.findByRole('button', { name: translate('shell.switchToLight') })).toBeTruthy()

    expect(screen.getByLabelText(translate('environment.badge', { environment: 'test' }))).toBeTruthy()
  })

  it('presents destinations from server capabilities rather than the role label', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    await renderAdminApp('/', {
      auth: {
        status: 'authenticated',
        principal: {
          userId: 'contradictory-super-administrator',
          effectiveRole: 'super_admin',
          capabilities: {
            canModerateUsers: false,
            canModerateAdministrators: false,
            canManageAdministrators: false,
          },
        },
      },
    })

    const navigation = await screen.findByRole('navigation', { name: translate('nav.primary') })
    expect(within(navigation).queryByRole('link', { name: translate('nav.comments') })).toBeNull()
    expect(within(navigation).queryByRole('link', { name: translate('nav.users') })).toBeNull()
    expect(within(navigation).queryByRole('link', { name: translate('nav.administrators') })).toBeNull()
    expect(within(navigation).getByRole('link', { name: translate('nav.charts') })).toBeTruthy()
  })
})