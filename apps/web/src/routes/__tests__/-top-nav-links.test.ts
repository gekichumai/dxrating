import { describe, expect, it } from 'vitest'
import {
  APP_TAB_LINKS,
  CHART_DISCOVERY_NAV_LINKS,
  getActiveAppTabValue,
  getPendingAppTabValue,
} from '../-top-nav-links'

describe('top nav links', () => {
  it('exposes crawlable hrefs for app tabs and chart discovery tabs', () => {
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
      { value: 'recent', href: '/charts/recent', labelKey: 'root:pages.recent.icon-label' },
      { value: 'trending', href: '/charts/trending', labelKey: 'root:pages.trending.icon-label' },
      { value: 'search', href: '/search', labelKey: 'root:pages.search.title' },
      { value: 'rating', href: '/rating', labelKey: 'root:pages.rating.title' },
    ])
  })

  it('selects the matching app tab for every top-level app page', () => {
    expect(getActiveAppTabValue('/search')).toBe('search')
    expect(getActiveAppTabValue('/rating')).toBe('rating')
    expect(getActiveAppTabValue('/charts/recent')).toBe('recent')
    expect(getActiveAppTabValue('/charts/trending')).toBe('trending')
  })

  it('selects a pending app tab only while the router loads a different resolved location', () => {
    expect(getPendingAppTabValue(true, '/search', '/rating')).toBe('search')
    expect(getPendingAppTabValue(true, '/charts/recent', '/charts/trending')).toBe('recent')
    expect(getPendingAppTabValue(true, '/songs/1/dx/master', '/rating')).toBe(false)
    expect(getPendingAppTabValue(true, '/search', '/search')).toBe(false)
    expect(getPendingAppTabValue(true, '/search')).toBe(false)
    expect(getPendingAppTabValue(false, '/search', '/rating')).toBe(false)
  })
})