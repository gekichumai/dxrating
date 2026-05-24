export const RECENT_CHARTS_NAV_LINK = {
  href: '/charts/recent',
  labelKey: 'root:pages.recent.icon-label',
} as const

export const APP_TAB_LINKS = [
  { value: 'search', href: '/search', labelKey: 'root:pages.search.title' },
  { value: 'rating', href: '/rating', labelKey: 'root:pages.rating.title' },
] as const

export type AppTabValue = (typeof APP_TAB_LINKS)[number]['value']
export type AppNavHref = (typeof APP_TAB_LINKS)[number]['href'] | typeof RECENT_CHARTS_NAV_LINK.href