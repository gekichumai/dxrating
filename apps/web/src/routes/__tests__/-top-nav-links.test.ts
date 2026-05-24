import { describe, expect, it } from 'vitest'
import { APP_TAB_LINKS, CHART_DISCOVERY_NAV_LINKS, getActiveAppTabValue } from '../-top-nav-links'

describe('top nav links', () => {
  it('exposes crawlable hrefs for primary tabs and recent charts', () => {
    expect(CHART_DISCOVERY_NAV_LINKS).toEqual([
      {
        value: 'recent',
        href: '/charts/recent',
        labelKey: 'root:pages.recent.icon-label',
      },
      {
        value: 'trending',
        href: '/charts/trending',
        labelKey: 'root:pages.trending.icon-label',
      },
    ])

    expect(APP_TAB_LINKS).toEqual([
      { value: 'search', href: '/search', labelKey: 'root:pages.search.title' },
      { value: 'rating', href: '/rating', labelKey: 'root:pages.rating.title' },
    ])
  })

  it('does not select a primary tab for the recent charts page', () => {
    expect(getActiveAppTabValue('/search')).toBe('search')
    expect(getActiveAppTabValue('/rating')).toBe('rating')
    expect(getActiveAppTabValue('/charts/recent')).toBe(false)
    expect(getActiveAppTabValue('/charts/trending')).toBe(false)
  })
})