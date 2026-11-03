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
  it('keys catalog pages by build, resolved locale, path and query', () => {
    expect(getHtmlCacheKey(request('/search?q=pandora', { 'accept-language': 'ja-JP,ja;q=0.9' }), 'abc')).toBe(
      'https://dxrating.net/__html-cache/abc/ja/search?q=pandora',
    )
    expect(getHtmlCacheKey(request('/songs/x/dx/master', { cookie: 'dxrating.locale=zh-Hant' }), 'abc')).toBe(
      'https://dxrating.net/__html-cache/abc/zh-Hant/songs/x/dx/master',
    )
  })

  it('shares one entry between Accept-Language values that resolve to the same locale', () => {
    expect(getHtmlCacheKey(request('/', { 'accept-language': 'zh-CN' }), 'abc')).toBe(
      getHtmlCacheKey(request('/', { 'accept-language': 'zh-SG,en;q=0.5' }), 'abc'),
    )
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