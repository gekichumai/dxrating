import { overwriteGetLocale } from '@/paraglide/runtime'
import { DEFAULT_LOCALE, type SupportedLocale, toSupportedLocale } from '@/setup/locale'

/**
 * The locale Paraglide messages use when a call passes no `{ locale }`.
 *
 * Components pass the locale explicitly (`m.key(inputs, { locale })`, with `locale` from useLocale()), so the server
 * render never depends on module state: a Worker isolate serves concurrent requests in different locales. This
 * fallback is for browser-only code: effect callbacks and modules outside React (toasts, import jobs). It follows the
 * locale the app shows, read when the message fires.
 */
let clientLocale: SupportedLocale | undefined

export function setClientLocale(locale: SupportedLocale) {
  clientLocale = locale
}

export function getClientLocale(): SupportedLocale {
  return clientLocale ?? toSupportedLocale(globalThis.document?.documentElement.lang) ?? DEFAULT_LOCALE
}

overwriteGetLocale(() => {
  if (import.meta.env.SSR) {
    // A server render must name its locale; module state is shared between the requests of an isolate
    if (import.meta.env.DEV) throw new Error('Paraglide message called without { locale } during SSR')
    return DEFAULT_LOCALE
  }
  return getClientLocale()
})