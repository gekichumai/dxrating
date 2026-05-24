export const CHART_DISCOVERY_NAV_LINKS = [
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
] as const

export const RECENT_CHARTS_NAV_LINK = CHART_DISCOVERY_NAV_LINKS[0]
export const TRENDING_CHARTS_NAV_LINK = CHART_DISCOVERY_NAV_LINKS[1]

export const APP_TAB_LINKS = [
  ...CHART_DISCOVERY_NAV_LINKS,
  { value: 'search', href: '/search', labelKey: 'root:pages.search.title' },
  { value: 'rating', href: '/rating', labelKey: 'root:pages.rating.title' },
] as const

export type AppTabValue = (typeof APP_TAB_LINKS)[number]['value']

export const getActiveAppTabValue = (pathname: string): AppTabValue | false =>
  APP_TAB_LINKS.find((link) => link.href === pathname)?.value ?? false