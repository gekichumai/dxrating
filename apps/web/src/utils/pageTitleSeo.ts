import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'
import type { SupportedLocale } from '@/setup/locale'
import { formatSeoTitle } from '@/utils/seo'

const PAGE_TITLES = {
  'auth:terms.title': m.auth_terms_title,
  'auth:privacy.title': m.auth_privacy_title,
  'auth:account-security.title': m.auth_accountSecurity_title,
  'rating-calculator:io.import.lxns.callback.page-title': m.ratingCalculator_io_import_lxns_callback_pageTitle,
} satisfies Record<string, PlainMessage>

export type PageTitleKey = keyof typeof PAGE_TITLES

/**
 * A localized `<title>` for a page that otherwise inherits the generic "DXRating" one (WCAG 2.4.2). Only the title:
 * description, canonical and indexing stay whatever the route already declares.
 */
export function buildPageTitleMeta(locale: SupportedLocale, key: PageTitleKey) {
  return [{ title: formatSeoTitle(PAGE_TITLES[key]({}, { locale })) }]
}