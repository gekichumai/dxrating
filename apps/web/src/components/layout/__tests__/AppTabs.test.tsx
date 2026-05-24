import { render, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { AppTabs } from '../AppTabs'

const { capture, routeLocation, routerState } = vi.hoisted(() => ({
  capture: vi.fn(),
  routeLocation: { pathname: '/rating' },
  routerState: {
    isTransitioning: false,
    location: { pathname: '/rating' },
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

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture }),
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
    routerState.isTransitioning = false
    routerState.location.pathname = '/rating'
  })

  it('selects the current route tab and captures the selected tab', () => {
    render(<AppTabs />)

    const ratingTab = screen.getByRole('tab', { name: 'My Rating' })

    expect(ratingTab.getAttribute('aria-selected')).toBe('true')
    expect(capture).toHaveBeenCalledWith('tab_switched', { tab: 'rating' })
  })

  it('selects the pending destination tab and shows a width-stable loading indicator', () => {
    routerState.isTransitioning = true
    routerState.location.pathname = '/search'

    render(<AppTabs />)

    const searchTab = screen.getByRole('tab', { name: 'Search Charts' })
    const ratingTab = screen.getByRole('tab', { name: 'My Rating' })

    expect(searchTab.getAttribute('aria-selected')).toBe('true')
    expect(searchTab.getAttribute('aria-busy')).toBe('true')
    expect(ratingTab.getAttribute('aria-selected')).toBe('false')
    expect(within(searchTab).getByRole('progressbar')).toBeTruthy()

    const originalLabel = within(searchTab).getByText('Search Charts')
    expect(originalLabel.getAttribute('aria-hidden')).toBe('true')
    expect(originalLabel.getAttribute('style')).toContain('visibility: hidden')
  })

  it('keeps icon-only tabs named while replacing their visible icon with the loading indicator', () => {
    routeLocation.pathname = '/charts/trending'
    routerState.isTransitioning = true
    routerState.location.pathname = '/charts/recent'

    render(<AppTabs />)

    const recentTab = screen.getByRole('tab', { name: 'Recently updated charts' })

    expect(recentTab.getAttribute('aria-selected')).toBe('true')
    expect(recentTab.getAttribute('aria-busy')).toBe('true')
    expect(recentTab.querySelector('.relative > span')?.className).toContain('inline-flex')
    expect(recentTab.querySelector('.relative > span')?.className).toContain('h-5')
    expect(within(recentTab).getByRole('progressbar')).toBeTruthy()
  })
})