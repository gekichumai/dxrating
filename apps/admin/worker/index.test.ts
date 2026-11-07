import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { SECURITY_HEADERS } from './index'

const env = (origin = 'https://admin-api.example.invalid') => ({
  ADMIN_API_ORIGIN: origin,
  ASSETS: { fetch: vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })) },
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

  it('serves the app with its own strict CSP', async () => {
    const res = await worker.fetch(new Request('https://admin.dxrating.net/'), env())
    expect(res.headers.get('content-security-policy')).toBe(SECURITY_HEADERS['Content-Security-Policy'])
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('answers 503 rather than guessing when the API origin is unset', async () => {
    expect((await worker.fetch(new Request('https://admin.dxrating.net/api/me'), env(''))).status).toBe(503)
  })
})