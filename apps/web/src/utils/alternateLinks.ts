import type { JSX } from 'react'
import { LOCALE_QUERY_PARAM, SUPPORTED_LOCALES, toSupportedLocale, type SupportedLocale } from '@/setup/locale'

const SITE_URL = 'https://dxrating.net'

type AlternateLinkLocation = {
  pathname: string
  search?: Record<string, unknown>
}

type AlternateLink = JSX.IntrinsicElements['link']

const appendSearchValue = (params: URLSearchParams, key: string, value: unknown) => {
  if (value == null) return

  if (Array.isArray(value)) {
    for (const item of value) {
      params.append(key, String(item))
    }
    return
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    params.set(key, String(value))
  }
}

export const buildLocalizedUrl = ({ pathname, search = {} }: AlternateLinkLocation, locale?: SupportedLocale) => {
  const url = new URL(pathname || '/', SITE_URL)

  for (const [key, value] of Object.entries(search)) {
    if (key === LOCALE_QUERY_PARAM) continue
    appendSearchValue(url.searchParams, key, value)
  }

  if (locale) {
    url.searchParams.set(LOCALE_QUERY_PARAM, locale)
  }

  return url.toString()
}

/**
 * The canonical and hreflang links of a page. Each `?locale=` variant is its own canonical URL: the locale variants
 * render different text, so pointing them all at the unparameterized URL contradicted the hreflang cluster and
 * Google indexed them on its own anyway. The unparameterized URL (content negotiated by cookie / Accept-Language)
 * is the x-default. Query parameters other than `locale` (search filters, `?q=`) never make a separate page.
 */
export const buildAlternateLinks = ({ pathname, search }: AlternateLinkLocation): AlternateLink[] => {
  const page = { pathname }
  const explicitLocale = toSupportedLocale(
    typeof search?.[LOCALE_QUERY_PARAM] === 'string' ? (search[LOCALE_QUERY_PARAM] as string) : undefined,
  )

  return [
    {
      rel: 'alternate',
      hrefLang: 'x-default',
      href: buildLocalizedUrl(page),
    },
    ...SUPPORTED_LOCALES.map((locale) => ({
      rel: 'alternate',
      hrefLang: locale,
      href: buildLocalizedUrl(page, locale),
    })),
    {
      rel: 'canonical',
      href: buildLocalizedUrl(page, explicitLocale ?? undefined),
    },
  ]
}