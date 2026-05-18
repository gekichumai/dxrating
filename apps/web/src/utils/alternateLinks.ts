import type { JSX } from 'react'
import { LOCALE_QUERY_PARAM, SUPPORTED_LOCALES, type SupportedLocale } from '@/setup/locale'

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

export const buildAlternateLinks = (location: AlternateLinkLocation): AlternateLink[] => [
  {
    rel: 'alternate',
    hrefLang: 'x-default',
    href: buildLocalizedUrl(location),
  },
  ...SUPPORTED_LOCALES.map((locale) => ({
    rel: 'alternate',
    hrefLang: locale,
    href: buildLocalizedUrl(location, locale),
  })),
]