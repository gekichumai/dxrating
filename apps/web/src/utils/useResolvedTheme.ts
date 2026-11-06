import { useSyncExternalStore } from 'react'
import { THEME_ATTRIBUTE } from '@/setup/theme-script'

export type ResolvedTheme = 'light' | 'dark'

const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] })
  return () => observer.disconnect()
}

const getSnapshot = (): ResolvedTheme | undefined => {
  const value = document.documentElement.getAttribute(THEME_ATTRIBUTE)
  return value === 'dark' || value === 'light' ? value : undefined
}

/**
 * The theme on <html data-theme> (set before paint by setup/theme-script.ts), for third-party widgets that take a
 * theme option instead of CSS. It is `undefined` on the server and during hydration, then follows the attribute, so
 * it must never decide server-rendered markup: use CSS variables or the `dark:` variant for that.
 */
export function useResolvedTheme(): ResolvedTheme | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}