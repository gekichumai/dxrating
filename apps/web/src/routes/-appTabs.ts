export const APP_TAB_VALUES = ['search', 'recent', 'trending', 'rating'] as const

export type AppTabValue = (typeof APP_TAB_VALUES)[number]

export function isAppTabValue(value: unknown): value is AppTabValue {
  return typeof value === 'string' && APP_TAB_VALUES.includes(value as AppTabValue)
}

export function resolveAppTab(value: unknown, fallback: AppTabValue = 'search'): AppTabValue {
  return isAppTabValue(value) ? value : fallback
}