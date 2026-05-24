import { describe, expect, it } from 'vitest'
import { APP_TAB_LINKS, RECENT_CHARTS_NAV_LINK } from '../-top-nav-links'

describe('top nav links', () => {
  it('exposes crawlable hrefs for primary tabs and recent charts', () => {
    expect(RECENT_CHARTS_NAV_LINK).toEqual({
      href: '/charts/recent',
      labelKey: 'root:pages.recent.icon-label',
    })

    expect(APP_TAB_LINKS).toEqual([
      { value: 'search', href: '/search', labelKey: 'root:pages.search.title' },
      { value: 'rating', href: '/rating', labelKey: 'root:pages.rating.title' },
    ])
  })
})