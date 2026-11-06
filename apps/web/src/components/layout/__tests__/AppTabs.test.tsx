import { fireEvent, render, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { AppTabs } from '../AppTabs'

const { capture, routeLocation, routerState } = vi.hoisted(() => ({
  capture: vi.fn(),
  routeLocation: { pathname: '/rating' },
  routerState: {
    isLoading: false,
    isTransitioning: false,
    location: { pathname: '/rating' },
    resolvedLocation: { pathname: '/rating' } as { pathname: string } | undefined,
  },
}))

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')

  return {
    Link: React.forwardRef<
      HTMLAnchorElement,
      React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; viewTransition?: boolean }
    >(({ to, viewTransition: _viewTransition, children, ...props }, ref) => (
      <a ref={ref} href={to} {...props}>
        {children}
      </a>
    )),
    useLocation: () => routeLocation,
    useRouterState: ({ select }: { select: (state: typeof routerState) => unknown }) => select(routerState),
  }
})

vi.mock('@/lib/analytics', () => ({
  captureAnalyticsEvent: capture,
}))

vi.mock('~icons/mdi/trending-up', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('~icons/mdi/update', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

describe('AppTabs', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    capture.mockClear()
    routeLocation.pathname = '/rating'
    routerState.isLoading = false
    routerState.isTransitioning = false
    routerState.location.pathname = '/rating'
    routerState.resolvedLocation = { pathname: '/rating' }
  })

  it('renders a navigation landmark of links with every link in the tab order', () => {
    render(<AppTabs />)

    const nav = screen.getByRole('navigation', { name: 'Main' })
    const links = within(nav).getAllByRole('link')

    expect(links).toHaveLength(4)
    expect(screen.queryByRole('tab')).toBeNull()
    for (const link of links) expect(link.getAttribute('tabindex')).toBeNull()
  })

  it('marks the current route link and captures deliberate navigation', () => {
    render(<AppTabs />)

    const ratingTab = screen.getByRole('link', { name: 'My rating' })

    expect(ratingTab.getAttribute('aria-current')).toBe('page')
    expect(ratingTab.hasAttribute('data-selected')).toBe(true)
    expect(capture).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(capture).toHaveBeenCalledWith('tab_switched', {
      tab: 'search',
      source: 'top_navigation',
    })
  })

  it('selects the pending destination tab and shows a width-stable loading indicator', () => {
    routerState.isLoading = true
    routerState.location.pathname = '/'
    routerState.resolvedLocation = { pathname: '/rating' }

    render(<AppTabs />)

    const searchTab = screen.getByRole('link', { name: 'Home' })
    const ratingTab = screen.getByRole('link', { name: 'My rating' })

    expect(searchTab.hasAttribute('data-selected')).toBe(true)
    expect(searchTab.getAttribute('aria-busy')).toBe('true')
    expect(ratingTab.hasAttribute('data-selected')).toBe(false)
    expect(within(searchTab).getByRole('progressbar')).toBeTruthy()

    const originalLabel = within(searchTab).getByText('Home')
    expect(originalLabel.getAttribute('aria-hidden')).toBe('true')
    expect(originalLabel.getAttribute('style')).toContain('visibility: hidden')
  })

  it('keeps icon-only tabs named while replacing their visible icon with the loading indicator', () => {
    routeLocation.pathname = '/charts/trending'
    routerState.isLoading = true
    routerState.location.pathname = '/charts/recent'
    routerState.resolvedLocation = { pathname: '/charts/trending' }

    render(<AppTabs />)

    const recentTab = screen.getByRole('link', { name: 'New charts' })

    expect(recentTab.hasAttribute('data-selected')).toBe(true)
    expect(recentTab.getAttribute('aria-busy')).toBe('true')
    expect(recentTab.querySelector('.relative > span')?.className).toContain('inline-flex')
    expect(recentTab.querySelector('.relative > span')?.className).toContain('h-5')
    expect(within(recentTab).getByRole('progressbar')).toBeTruthy()
  })

  it('does not show a loading indicator for the initial unresolved location', () => {
    routerState.isLoading = true
    routerState.resolvedLocation = undefined

    render(<AppTabs />)

    const ratingTab = screen.getByRole('link', { name: 'My rating' })

    expect(ratingTab.getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})