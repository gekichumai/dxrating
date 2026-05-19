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
  it('builds alternate links for the current route instead of the homepage', () => {
    expect(buildAlternateLinks({ pathname: '/songs/song-1', search: { type: 'dx' } })).toEqual([
      {
        rel: 'alternate',
        hrefLang: 'x-default',
        href: 'https://dxrating.net/songs/song-1?type=dx',
      },
      {
        rel: 'alternate',
        hrefLang: 'en',
        href: 'https://dxrating.net/songs/song-1?type=dx&locale=en',
      },
      {
        rel: 'alternate',
        hrefLang: 'ja',
        href: 'https://dxrating.net/songs/song-1?type=dx&locale=ja',
      },
      {
        rel: 'alternate',
        hrefLang: 'zh-Hans',
        href: 'https://dxrating.net/songs/song-1?type=dx&locale=zh-Hans',
      },
      {
        rel: 'alternate',
        hrefLang: 'zh-Hant',
        href: 'https://dxrating.net/songs/song-1?type=dx&locale=zh-Hant',
      },
    ])
  })
})