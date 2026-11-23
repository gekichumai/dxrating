import { isSupportedLocale, LOCALE_HEADER, type SupportedLocale } from '@gekichumai/api-contract'
import { parse as parseCookie } from 'cookie'

/** The web's language cookie (apps/web/src/setup/locale.ts), written by the language picker */
const LOCALE_COOKIE_NAME = 'dxrating.locale'

/** Legacy and ISO 639-1 primary tags browsers still send, by the language they mean */
const PRIMARY_LANGUAGE_ALIASES = new Map<string, SupportedLocale>([
  ['in', 'id'],
  ['tl', 'fil'],
])

/** A BCP-47 tag from Accept-Language as a supported locale: `zh-TW` is Traditional Chinese, `ms-MY` is Malay */
const fromLanguageTag = (tag: string): SupportedLocale | null => {
  const lower = tag.trim().replaceAll('_', '-').toLowerCase()
  if (lower === 'zh-hant' || lower.startsWith('zh-hant-') || ['zh-tw', 'zh-hk', 'zh-mo'].includes(lower)) {
    return 'zh-Hant'
  }
  const primary = lower.split('-')[0]
  if (primary === 'zh') return 'zh-Hans'
  if (isSupportedLocale(primary)) return primary
  return PRIMARY_LANGUAGE_ALIASES.get(primary) ?? null
}

const fromAcceptLanguage = (header: string | null): SupportedLocale | null => {
  if (!header) return null
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
      return { tag, index, quality: q ? Number(q.slice(2)) : 1 }
    })
    .filter(({ tag, quality }) => tag !== '' && tag !== '*' && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
  for (const { tag } of ranked) {
    const locale = fromLanguageTag(tag)
    if (locale) return locale
  }
  return null
}

/**
 * The language of a Better Auth error message: the page's own (the web's {@link LOCALE_HEADER}), then the language
 * cookie, then Accept-Language, for clients that send no header (the iOS app). `null` leaves Better Auth's English.
 */
export const detectAuthLocale = (headers: Headers | undefined): SupportedLocale | null => {
  if (!headers) return null
  const fromHeader = headers.get(LOCALE_HEADER)
  if (isSupportedLocale(fromHeader)) return fromHeader
  const fromCookie = parseCookie(headers.get('cookie') ?? '')[LOCALE_COOKIE_NAME]
  if (isSupportedLocale(fromCookie)) return fromCookie
  return fromAcceptLanguage(headers.get('accept-language'))
}