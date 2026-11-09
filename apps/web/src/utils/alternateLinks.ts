import type { JSX } from 'react'
import {
  DEFAULT_LOCALE,
  LOCALE_QUERY_PARAM,
  SUPPORTED_LOCALES,
  localizePath,
  type SupportedLocale,
} from '@/setup/locale'

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

/**
 * A page's absolute URL in a language: its path under the language's prefix (`/ja/songs/x`; none for English), with the
 * search kept except a leftover `locale`. With no locale, the unprefixed URL.
 */
export const buildLocalizedUrl = ({ pathname, search = {} }: AlternateLinkLocation, locale?: SupportedLocale) => {
  const url = new URL(localizePath(pathname || '/', locale ?? DEFAULT_LOCALE), SITE_URL)

  for (const [key, value] of Object.entries(search)) {
    if (key === LOCALE_QUERY_PARAM) continue
    appendSearchValue(url.searchParams, key, value)
  }

  return url.toString()
}

// A chart page: /songs/<id>/<type>/<difficulty>
const CHART_PAGE_PATH = /^\/songs\/([^/]+)\/[^/]+\/[^/]+$/

/**
 * The path a page names as its canonical. A chart page names its song's page (`/songs/<id>/dx/master` → `/songs/<id>`):
 * a search for the song name matched a dozen chart URLs of one song, which split its ranking between them, so the song
 * page, which lists every chart, is the one to rank. Every other page is its own canonical.
 */
export const canonicalPagePath = (pathname: string) => {
  const chart = CHART_PAGE_PATH.exec(pathname)
  return chart ? `/songs/${chart[1]}` : pathname
}

/**
 * The canonical and hreflang links of a page (`pathname` is the router's, without the language prefix). Each language's
 * URL is its own canonical (meta#52): `/ja/songs/x` → itself, `/songs/x` → itself. The unprefixed (English) URL is also
 * the x-default: a visitor who prefers another language is redirected from it to theirs (setup/locale-redirect.ts).
 * Query parameters (search filters, `?q=`) never make a separate page.
 */
export const buildAlternateLinks = (
  { pathname }: AlternateLinkLocation,
  pageLocale: SupportedLocale,
): AlternateLink[] => {
  const page = { pathname }

  const canonicalPath = canonicalPagePath(pathname)
  if (canonicalPath !== pathname) {
    // A page that defers to another names only its canonical, in the same language. The language cluster belongs to
    // the canonical page; hreflang links here would point at URLs that aren't canonical
    return [{ rel: 'canonical', href: buildLocalizedUrl({ pathname: canonicalPath }, pageLocale) }]
  }

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
      href: buildLocalizedUrl(page, pageLocale),
    },
  ]
}