/**
 * The admin.dxrating.net Worker (gekichumai/meta#50 L3). Cloudflare Access sits in front of the whole host and adds
 * `Cf-Access-Jwt-Assertion` to every request it lets through. This Worker:
 * - forwards `/api/*` unchanged (assertion included) to the admin API service, which verifies the assertion itself;
 * - serves the SPA's static assets with a strict CSP of its own.
 */
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  /** The admin API's origin, e.g. https://admin-api.dxrating.net */
  ADMIN_API_ORIGIN: string
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

const withHeaders = (response: Response, headers: Record<string, string>) => {
  const next = new Response(response.body, response)
  for (const [name, value] of Object.entries(headers)) next.headers.set(name, value)
  return next
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      if (!env.ADMIN_API_ORIGIN) return new Response('Admin API is not configured', { status: 503 })
      const target = new URL(url.pathname + url.search, env.ADMIN_API_ORIGIN)
      const response = await fetch(new Request(target, request))
      return withHeaders(response, { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' })
    }
    return withHeaders(await env.ASSETS.fetch(request), SECURITY_HEADERS)
  },
}