// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { localeRedirect } from '../locale-redirect'

const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  localeRedirect(new Request(`https://dxrating.net${path}`, { method, headers }))

const expectRedirect = (response: Response | null, status: number, location: string) => {
  expect(response?.status).toBe(status)
  expect(response?.headers.get('Location')).toBe(location)
}

describe('?locale= (the old scheme) moves to the path permanently', () => {
  it('keeps every other query parameter, in order: the 是什么歌 link', () => {
    expectRedirect(
      get('/?q=%E3%83%86%E3%82%B9%E3%83%88&locale=zh-Hans&ref=shenmegequ'),
      301,
      '/zh-hans?q=%E3%83%86%E3%82%B9%E3%83%88&ref=shenmegequ',
    )
  })

  it('moves inner pages and drops the parameter for English', () => {
    expectRedirect(get('/songs/dsng_x/dx/master?locale=ja'), 301, '/ja/songs/dsng_x/dx/master')
    expectRedirect(get('/rating?locale=en&tab=b50'), 301, '/rating?tab=b50')
    expectRedirect(get('/search?locale=zh-TW'), 301, '/zh-hant/search')
  })

  it('lets the parameter win over a prefix, as it did over the cookie', () => {
    expectRedirect(get('/ja/rating?locale=ko'), 301, '/ko/rating')
    expectRedirect(get('/ja/rating?locale=en'), 301, '/rating')
  })

  it('serves the URL as it is for an unsupported value', () => {
    expect(get('/rating?locale=fr')).toBeNull()
    expect(get('/ja/rating?locale=')).toBeNull()
  })

  it('leaves files and framework paths alone', () => {
    expect(get('/sitemap.xml?locale=ja')).toBeNull()
    expect(get('/.well-known/apple-app-site-association?locale=ja')).toBeNull()
    expect(get('/_serverFn/abc?locale=ja')).toBeNull()
  })
})

describe('non-canonical prefixes', () => {
  it('lowercases the prefix and moves /en to the unprefixed URL', () => {
    expectRedirect(get('/zh-Hans/songs/x?q=1'), 301, '/zh-hans/songs/x?q=1')
    expectRedirect(get('/JA'), 301, '/ja')
    expectRedirect(get('/en/rating'), 301, '/rating')
    expectRedirect(get('/EN'), 301, '/')
  })

  it('serves canonical prefixed URLs', () => {
    expect(get('/zh-hans/songs/x', { cookie: 'dxrating.locale=ja' })).toBeNull()
    expect(get('/th')).toBeNull()
  })
})

describe('an unprefixed (English) URL and the visitor preference', () => {
  it('sends a visitor who picked another language to it, temporarily', () => {
    const response = get('/songs/x?q=1', { cookie: 'dxrating.locale=ja', 'accept-language': 'en-US' })
    expectRedirect(response, 302, '/ja/songs/x?q=1')
    expect(response?.headers.get('Vary')).toBe('Cookie, Accept-Language')
    expect(response?.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('uses Accept-Language without a cookie, and the cookie over it', () => {
    expectRedirect(get('/', { 'accept-language': 'ko-KR,ko;q=0.9' }), 302, '/ko')
    expect(get('/', { cookie: 'dxrating.locale=en', 'accept-language': 'ko-KR' })).toBeNull()
  })

  it('serves English to crawlers and English browsers', () => {
    expect(get('/songs/x')).toBeNull()
    expect(get('/songs/x', { 'accept-language': 'en-GB,fr;q=0.5' })).toBeNull()
  })

  it('answers OAuth and import callbacks where their providers send them', () => {
    expect(get('/io/import/lxns/oauth_callback?code=x', { cookie: 'dxrating.locale=ja' })).toBeNull()
    expect(get('/account/security', { cookie: 'dxrating.locale=ja' })).toBeNull()
  })

  it('only redirects reads', () => {
    expect(get('/', { cookie: 'dxrating.locale=ja' }, 'POST')).toBeNull()
  })
})