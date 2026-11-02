/**
 * The permanent redirect for a page URL with a trailing slash (`/rating/` → `/rating`), keeping the query.
 * The router would answer these with a temporary 307, which search engines don't consolidate.
 */
export function trailingSlashRedirect(request: Request): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null

  const url = new URL(request.url)
  if (url.pathname === '/' || !url.pathname.endsWith('/')) return null

  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  return new Response(null, { status: 308, headers: { Location: `${pathname}${url.search}` } })
}