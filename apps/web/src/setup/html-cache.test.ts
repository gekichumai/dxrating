// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HTML_CACHE_STATUS_HEADER,
  fromStoredHtmlResponse,
  getHtmlCacheKey,
  isCacheableHtmlResponse,
  serveWithHtmlCache,
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
    expect(hit.headers.get('X-DXRating-Stored-At')).toBeNull()
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

describe('serveWithHtmlCache', () => {
  const MINUTE = 60_000
  const DAY = 24 * 60 * MINUTE
  const START = Date.parse('2026-11-27T00:00:00.000Z')
  const KEY = 'https://dxrating.net/__html-cache/abc/ja/songs/x'

  // A data center's Cache API: an entry is matched until its s-maxage runs out
  class EdgeCache {
    entries = new Map<string, { body: string; headers: Headers; expiresAt: number }>()
    async match(key: RequestInfo | URL) {
      const entry = this.entries.get(String(key))
      if (!entry || Date.now() >= entry.expiresAt) return undefined
      return new Response(entry.body, { headers: entry.headers })
    }
    async put(key: RequestInfo | URL, response: Response) {
      const maxAge = Number(response.headers.get('Cache-Control')?.match(/s-maxage=(\d+)/)?.[1] ?? 0)
      this.entries.set(String(key), {
        body: await response.text(),
        headers: new Headers(response.headers),
        expiresAt: Date.now() + maxAge * 1000,
      })
    }
  }

  // Each render is told apart by its body; `render.mock.calls.length` counts the renders
  const renderer = () => {
    let count = 0
    return vi.fn(async () => htmlPage(`render ${++count}`))
  }
  const htmlPage = (body: string, status = 200) =>
    new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

  // ctx.waitUntil: keeps what the Worker runs after the response, so a test can await it
  const backgroundWork = () => {
    const pending: Promise<unknown>[] = []
    return {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      settle: async () => {
        while (pending.length) await pending.shift()
      },
    }
  }

  const visit = async (
    cache: EdgeCache,
    render: () => Promise<Response>,
    background: ReturnType<typeof backgroundWork>,
  ) => {
    const response = await serveWithHtmlCache(cache, KEY, render, background.waitUntil)
    return { status: response.headers.get(HTML_CACHE_STATUS_HEADER), body: await response.text() }
  }

  // Only the clock: the background render waits for a real timer
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders and stores a page on a miss, and serves the copy for the next 30 minutes without rendering', async () => {
    const cache = new EdgeCache()
    const render = renderer()
    const background = backgroundWork()

    expect(await visit(cache, render, background)).toEqual({ status: 'MISS', body: 'render 1' })
    await background.settle()
    expect(cache.entries.get(KEY)?.headers.get('Cache-Control')).toBe('public, s-maxage=604800')

    vi.setSystemTime(START + 29 * MINUTE)
    expect(await visit(cache, render, background)).toEqual({ status: 'HIT', body: 'render 1' })
    await background.settle()
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('serves an older copy at once and renders it again once, after the response', async () => {
    const cache = new EdgeCache()
    const render = renderer()
    const background = backgroundWork()
    await visit(cache, render, background)
    await background.settle()

    // Two visitors in the same isolate before the new render lands: both get the copy, one render replaces it
    vi.setSystemTime(START + 31 * MINUTE)
    expect(await visit(cache, render, background)).toEqual({ status: 'HIT', body: 'render 1' })
    expect(await visit(cache, render, background)).toEqual({ status: 'HIT', body: 'render 1' })
    expect(render).toHaveBeenCalledTimes(1)
    await background.settle()
    expect(render).toHaveBeenCalledTimes(2)

    expect(await visit(cache, render, background)).toEqual({ status: 'HIT', body: 'render 2' })
    await background.settle()
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('keeps a page for 7 days, as long as a build lives', async () => {
    const cache = new EdgeCache()
    const render = renderer()
    const background = backgroundWork()
    await visit(cache, render, background)
    await background.settle()
    const failing = vi.fn(async () => htmlPage('error', 500))

    // A failed background render keeps the copy
    vi.setSystemTime(START + 7 * DAY - MINUTE)
    expect(await visit(cache, failing, background)).toEqual({ status: 'HIT', body: 'render 1' })
    await background.settle()
    expect(failing).toHaveBeenCalledTimes(1)

    vi.setSystemTime(START + 7 * DAY)
    expect(await visit(cache, render, background)).toEqual({ status: 'MISS', body: 'render 2' })
  })
})