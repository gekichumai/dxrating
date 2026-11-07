/**
 * The languages DXRating is translated into: the one list the backend, the web and the data the API serves to the
 * iOS app read. Adding a language here (with its `apps/web/messages/<tag>.json` and the Paraglide settings entry,
 * which a web test keeps in step) is all it takes; stored localized text is keyed by these tags, never by a column
 * or enum per language.
 */
export const BASE_LOCALE = 'en'

export const SUPPORTED_LOCALES = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/**
 * Languages tried, in order, after the viewer's own and before {@link BASE_LOCALE}. A language without an entry
 * falls back to the base locale directly.
 */
export const LOCALE_FALLBACKS: Readonly<Partial<Record<SupportedLocale, readonly SupportedLocale[]>>> = {
  'zh-Hant': ['zh-Hans'],
  'zh-Hans': ['zh-Hant'],
}

const SUPPORTED = new Set<string>(SUPPORTED_LOCALES)

export const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  typeof value === 'string' && SUPPORTED.has(value)

/** The languages to try for a viewer: their own, its fallbacks, then the base locale, without repeats */
export function localeChain(
  locale: string,
  fallbacks: Readonly<Partial<Record<string, readonly string[]>>> = LOCALE_FALLBACKS,
): string[] {
  return [...new Set([locale, ...(fallbacks[locale] ?? []), BASE_LOCALE])]
}

/**
 * The text a viewer reads from a localized map, and the language it is in (a fallback's, when theirs is missing).
 * Blank values count as missing. Returns null only when not even the base locale has text.
 */
export function resolveLocalized(
  text: Readonly<Record<string, string | undefined>>,
  locale: string,
  fallbacks?: Readonly<Partial<Record<string, readonly string[]>>>,
): { locale: string; value: string } | null {
  for (const candidate of localeChain(locale, fallbacks)) {
    const value = text[candidate]
    if (typeof value === 'string' && value.trim() !== '') return { locale: candidate, value }
  }
  return null
}