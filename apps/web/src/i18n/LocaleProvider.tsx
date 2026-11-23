import { useRouterState } from '@tanstack/react-router'
import {
  type FC,
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { DEFAULT_LOCALE, type SupportedLocale, splitLocalePath } from '@/setup/locale'
import { setClientLocale } from './runtime'

interface LocaleContextValue {
  locale: SupportedLocale
  /** Switches the UI language in place (no reload). Resolves once the new language has rendered. */
  setLocale: (locale: SupportedLocale) => Promise<void>
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

/**
 * The locale the app renders in. The server seeds it from the request (root route context), and the first client
 * render starts from the same value, so the hydrated markup matches.
 */
export const LocaleProvider: FC<PropsWithChildren<{ initialLocale: SupportedLocale }>> = ({
  initialLocale,
  children,
}) => {
  const [locale, setLocaleState] = useState(() => {
    if (!import.meta.env.SSR) setClientLocale(initialLocale)
    return initialLocale
  })

  const setLocale = useCallback(async (next: SupportedLocale) => {
    setClientLocale(next)
    flushSync(() => setLocaleState(next))
  }, [])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

/** The current UI locale. Pass it to every message call: `m.key(inputs, { locale })`. */
export function useLocale(): SupportedLocale {
  return useContext(LocaleContext)?.locale ?? DEFAULT_LOCALE
}

export function useSetLocale(): LocaleContextValue['setLocale'] {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useSetLocale must be used inside LocaleProvider')
  return context.setLocale
}
/**
 * Keeps the UI language on the language of the URL. The path names the page's language (`/ja/…`), and the picker
 * changes both together, but Back and Forward move between paths of different languages without it. Mounted once,
 * inside the router and the LocaleProvider. An effect, so the first render keeps the server's locale.
 */
export const LocaleUrlSync: FC = () => {
  const publicHref = useRouterState({ select: (state) => state.location.publicHref })
  const locale = useLocale()
  const setLocale = useSetLocale()

  useEffect(() => {
    const urlLocale = splitLocalePath(new URL(publicHref, 'https://dxrating.net').pathname).locale
    if (urlLocale !== locale) void setLocale(urlLocale)
    // Only a URL change re-checks: a picker switch updates the locale first and the URL a moment later
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [publicHref])

  return null
}