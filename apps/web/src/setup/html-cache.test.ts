// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  HTML_CACHE_STATUS_HEADER,
  fromStoredHtmlResponse,
  getHtmlCacheKey,
  isCacheableHtmlResponse,
  toStoredHtmlResponse,
} from './html-cache'

const request = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`https://dxrating.net${path}`, { method, headers })

const htmlResponse = (headers: Record<string, string> = {}, status = 200) =>
  new Response('<html></html>', { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } })

describe('getHtmlCacheKey', () => {
  it('keys catalog pages by build, path and query: the path carries the locale', () => {
    expect(getHtmlCacheKey(request('/ja/search?q=pandora'), 'abc')).toBe(
      'https://dxrating.net/__html-cache/abc/ja/search?q=pandora',
    )
    expect(getHtmlCacheKey(request('/zh-hant/songs/x/dx/master'), 'abc')).toBe(
      'https://dxrating.net/__html-cache/abc/zh-hant/songs/x/dx/master',
    )
    expect(getHtmlCacheKey(request('/ja'), 'abc')).toBe('https://dxrating.net/__html-cache/abc/ja')
  })

  it('ignores the cookie and Accept-Language: an unprefixed URL is English for everyone it reaches', () => {
    // A visitor who prefers another language is redirected before the cache (setup/locale-redirect.ts)
    expect(getHtmlCacheKey(request('/', { 'accept-language': 'zh-CN' }), 'abc')).toBe(
      getHtmlCacheKey(request('/', { cookie: 'dxrating.locale=ja' }), 'abc'),
    )
    expect(getHtmlCacheKey(request('/'), 'abc')).toBe('https://dxrating.net/__html-cache/abc/')
  })

  it('applies the allowlist to the path without its locale prefix', () => {
    expect(getHtmlCacheKey(request('/th/songs/x'), 'abc')).not.toBeNull()
    expect(getHtmlCacheKey(request('/ja/charts/trending'), 'abc')).toBeNull()
    expect(getHtmlCacheKey(request('/ja/account/security'), 'abc')).toBeNull()
  })

  it('skips requests that must not share a cached page', () => {
    expect(getHtmlCacheKey(request('/search'), undefined)).toBeNull()
    expect(getHtmlCacheKey(request('/search', {}, 'POST'), 'abc')).toBeNull()
    expect(getHtmlCacheKey(request('/search', { authorization: 'Bearer x' }), 'abc')).toBeNull()
    expect(getHtmlCacheKey(request('/search', { cookie: '__Secure-dxrating.session_token=x' }), 'abc')).toBeNull()
    expect(getHtmlCacheKey(request('/charts/trending'), 'abc')).toBeNull()
    expect(getHtmlCacheKey(request('/account/security'), 'abc')).toBeNull()
  })
})

describe('isCacheableHtmlResponse', () => {
  it('accepts plain 200 HTML only', () => {
    expect(isCacheableHtmlResponse(htmlResponse())).toBe(true)
    expect(isCacheableHtmlResponse(htmlResponse({}, 404))).toBe(false)
    expect(isCacheableHtmlResponse(htmlResponse({ 'Set-Cookie': 'a=b' }))).toBe(false)
    expect(isCacheableHtmlResponse(htmlResponse({ 'Cache-Control': 'no-store' }))).toBe(false)
    expect(isCacheableHtmlResponse(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))).toBe(false)
  })
})

describe('stored HTML round trip', () => {
  it('serves a hit with a fresh CSP nonce in the policy and the markup', async () => {
    const original = new Response(
      '<meta property="csp-nonce" content="OLD+nonce=="/><script nonce="OLD+nonce==">x</script>',
      {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': "script-src 'self' 'nonce-OLD+nonce==' 'unsafe-inline'",
          'Content-Security-Policy-Report-Only': "script-src 'self' 'nonce-OLD+nonce==' 'strict-dynamic'",
          'Server-Timing': 'ssr;dur=12.0',
          Vary: 'Cookie, Accept-Language',
        },
      },
    )

    const stored = toStoredHtmlResponse(original)
    expect(stored.headers.get('Cache-Control')).toMatch(/s-maxage=\d+/)

    const hit = await fromStoredHtmlResponse(stored, 'NEW/nonce==')
    expect(hit.headers.get('Cache-Control')).toBeNull()
    expect(hit.headers.get(HTML_CACHE_STATUS_HEADER)).toBe('HIT')
    expect(hit.headers.get('Vary')).toBe('Cookie, Accept-Language')
    expect(hit.headers.get('Server-Timing')).toBe('cache;desc="hit"')
    expect(hit.headers.get('Content-Security-Policy')).toBe("script-src 'self' 'nonce-NEW/nonce==' 'unsafe-inline'")
    expect(hit.headers.get('Content-Security-Policy-Report-Only')).toContain("'nonce-NEW/nonce=='")
    const body = await hit.text()
    expect(body).not.toContain('OLD+nonce==')
    expect(body).toBe('<meta property="csp-nonce" content="NEW/nonce=="/><script nonce="NEW/nonce==">x</script>')
  })
})
describe('getHtmlCacheKey plates', () => {
  it('caches plate pages: the user overlay is client-only', () => {
    expect(getHtmlCacheKey(request('/plates'), 'abc')).toBe('https://dxrating.net/__html-cache/abc/plates')
    expect(getHtmlCacheKey(request('/plates/kagami-shin?region=cn'), 'abc')).toBe(
      'https://dxrating.net/__html-cache/abc/plates/kagami-shin?region=cn',
    )
  })

  it('caches the public tool pages', () => {
    expect(getHtmlCacheKey(request('/tools/rating'), 'abc')).not.toBeNull()
    expect(getHtmlCacheKey(request('/tools/tolerance'), 'abc')).not.toBeNull()
    expect(getHtmlCacheKey(request('/songs/dsng_abc/dx/master/tolerance'), 'abc')).toBe(
      'https://dxrating.net/__html-cache/abc/songs/dsng_abc/dx/master/tolerance',
    )
  })
})