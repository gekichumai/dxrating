import { describe, expect, it } from 'vitest'
import { buildAlternateLinks, buildLocalizedUrl } from '../alternateLinks'

describe('buildLocalizedUrl', () => {
  it('keeps the active pathname and replaces only the locale query', () => {
    expect(
      buildLocalizedUrl(
        {
          pathname: '/search',
          search: {
            q: '宴',
            locale: 'ja',
            difficulty: undefined,
          },
        },
        'zh-Hant',
      ),
    ).toBe('https://dxrating.net/search?q=%E5%AE%B4&locale=zh-Hant')
  })

  it('builds the default variant without a locale query', () => {
    expect(buildLocalizedUrl({ pathname: '/rating', search: { locale: 'zh-Hans' } })).toBe(
      'https://dxrating.net/rating',
    )
  })
})

describe('buildAlternateLinks', () => {
  it('builds alternate links for the current route, dropping non-locale query params', () => {
    expect(buildAlternateLinks({ pathname: '/songs/song-1', search: { type: 'dx' } })).toEqual([
      {
        rel: 'alternate',
        hrefLang: 'x-default',
        href: 'https://dxrating.net/songs/song-1',
      },
      {
        rel: 'alternate',
        hrefLang: 'en',
        href: 'https://dxrating.net/songs/song-1?locale=en',
      },
      {
        rel: 'alternate',
        hrefLang: 'ja',
        href: 'https://dxrating.net/songs/song-1?locale=ja',
      },
      {
        rel: 'alternate',
        hrefLang: 'ko',
        href: 'https://dxrating.net/songs/song-1?locale=ko',
      },
      {
        rel: 'alternate',
        hrefLang: 'zh-Hans',
        href: 'https://dxrating.net/songs/song-1?locale=zh-Hans',
      },
      {
        rel: 'alternate',
        hrefLang: 'zh-Hant',
        href: 'https://dxrating.net/songs/song-1?locale=zh-Hant',
      },
      ...['ms', 'id', 'fil', 'vi', 'th', 'my'].map((locale) => ({
        rel: 'alternate',
        hrefLang: locale,
        href: `https://dxrating.net/songs/song-1?locale=${locale}`,
      })),
      { rel: 'canonical', href: 'https://dxrating.net/songs/song-1' },
    ])
  })

  it('makes an explicit locale variant self-canonical', () => {
    const links = buildAlternateLinks({ pathname: '/rating', search: { locale: 'ja', q: 'x' } })
    expect(links.at(-1)).toEqual({ rel: 'canonical', href: 'https://dxrating.net/rating?locale=ja' })
  })

  it('ignores an unsupported locale for the canonical', () => {
    const links = buildAlternateLinks({ pathname: '/rating', search: { locale: 'fr' } })
    expect(links.at(-1)).toEqual({ rel: 'canonical', href: 'https://dxrating.net/rating' })
  })
})