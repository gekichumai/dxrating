import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '@/setup/locale'
import { buildAlternateLinks, buildLocalizedUrl } from '../alternateLinks'

describe('buildLocalizedUrl', () => {
  it("puts the path under the language's prefix and keeps the search, minus a leftover locale", () => {
    expect(
      buildLocalizedUrl({ pathname: '/search', search: { q: '宴', locale: 'ja', difficulty: undefined } }, 'zh-Hant'),
    ).toBe('https://dxrating.net/zh-hant/search?q=%E5%AE%B4')
    expect(buildLocalizedUrl({ pathname: '/' }, 'th')).toBe('https://dxrating.net/th')
  })

  it('builds the unprefixed (English) URL without a locale', () => {
    expect(buildLocalizedUrl({ pathname: '/rating', search: { locale: 'zh-Hans' } })).toBe(
      'https://dxrating.net/rating',
    )
    expect(buildLocalizedUrl({ pathname: '/' }, 'en')).toBe('https://dxrating.net/')
  })
})

describe('buildAlternateLinks', () => {
  const prefixes: Record<string, string> = { 'zh-Hans': 'zh-hans', 'zh-Hant': 'zh-hant' }
  const hrefIn = (locale: string) =>
    locale === 'en'
      ? 'https://dxrating.net/songs/song-1'
      : `https://dxrating.net/${prefixes[locale] ?? locale}/songs/song-1`

  it('lists every language at its path, with the unprefixed URL as x-default, and no query', () => {
    expect(buildAlternateLinks({ pathname: '/songs/song-1', search: { type: 'dx' } }, 'en')).toEqual([
      { rel: 'alternate', hrefLang: 'x-default', href: 'https://dxrating.net/songs/song-1' },
      ...SUPPORTED_LOCALES.map((locale) => ({ rel: 'alternate', hrefLang: locale, href: hrefIn(locale) })),
      { rel: 'canonical', href: 'https://dxrating.net/songs/song-1' },
    ])
  })

  it("makes each language's URL its own canonical", () => {
    expect(buildAlternateLinks({ pathname: '/rating', search: { q: 'x' } }, 'ja').at(-1)).toEqual({
      rel: 'canonical',
      href: 'https://dxrating.net/ja/rating',
    })
    expect(buildAlternateLinks({ pathname: '/songs/song-1' }, 'zh-Hant').at(-1)).toEqual({
      rel: 'canonical',
      href: hrefIn('zh-Hant'),
    })
  })
})