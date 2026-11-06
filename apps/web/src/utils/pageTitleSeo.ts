import { createServerI18n } from '@/setup/init-i18n'
import type { SupportedLocale } from '@/setup/locale'
import { formatSeoTitle } from '@/utils/seo'

const i18nCache = new Map<SupportedLocale, ReturnType<typeof createServerI18n>>()

function translate(locale: SupportedLocale, key: string) {
  let instance = i18nCache.get(locale)
  if (!instance) {
    instance = createServerI18n(locale)
    i18nCache.set(locale, instance)
  }
  return instance.t(key)
}

/**
 * A localized `<title>` for a page that otherwise inherits the generic "DXRating" one (WCAG 2.4.2). Only the title:
 * description, canonical and indexing stay whatever the route already declares.
 */
export function buildPageTitleMeta(locale: SupportedLocale, key: string) {
  return [{ title: formatSeoTitle(translate(locale, key)) }]
}