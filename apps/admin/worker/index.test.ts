import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const env = (origin = 'https://admin-api.example.invalid') => ({
  ADMIN_API_ORIGIN: origin,
  ASSETS: {
    fetch: vi.fn(
      async () =>
        new Response('<html><head><meta name="csp-nonce" content="" /></head></html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
    ),
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('admin Worker', () => {
  it('forwards /api with the Access assertion to the admin API and never caches it', async () => {
    const upstream = vi.fn(async (request: Request) =>
      Response.json({ seen: request.headers.get('cf-access-jwt-assertion'), url: request.url }),
    )
    vi.stubGlobal('fetch', upstream)
    const res = await worker.fetch(
      new Request('https://admin.dxrating.net/api/me?x=1', { headers: { 'cf-access-jwt-assertion': 'jwt' } }),
      env(),
    )
    expect(await res.json()).toEqual({ seen: 'jwt', url: 'https://admin-api.example.invalid/api/me?x=1' })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('does not forward look-alike paths', async () => {
    const e = env()
    vi.stubGlobal('fetch', vi.fn())
    await worker.fetch(new Request('https://admin.dxrating.net/apix'), e)
    expect(e.ASSETS.fetch).toHaveBeenCalledOnce()
  })

  it('serves the app with its own strict CSP and a fresh style nonce per response', async () => {
    const res = await worker.fetch(new Request('https://admin.dxrating.net/'), env())
    const csp = res.headers.get('content-security-policy')!
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]!
    expect(await res.text()).toContain(`<meta name="csp-nonce" content="${nonce}" />`)
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/script-src[^;]*(unsafe|nonce)/)
    expect(csp).toContain("style-src-attr 'unsafe-inline'")
    expect(csp).not.toMatch(/style-src-elem[^;]*unsafe-inline/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const again = await worker.fetch(new Request('https://admin.dxrating.net/'), env())
    expect(again.headers.get('content-security-policy')).not.toBe(csp)
  })

  it('answers 503 rather than guessing when the API origin is unset', async () => {
    expect((await worker.fetch(new Request('https://admin.dxrating.net/api/me'), env(''))).status).toBe(503)
  })
})