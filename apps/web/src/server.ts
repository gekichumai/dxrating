import * as Sentry from '@sentry/cloudflare'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import { StartServer, createStartHandler } from '@tanstack/react-start/server'
import { renderRouterToStream } from '@tanstack/react-router/ssr/server'
import { createElement } from 'react'
import { createServerEntry, type ServerEntry } from '@tanstack/react-start/server-entry'
import { applyAgentDiscoveryHeaders } from './setup/agent-discovery'
import {
  HTML_CACHE_STATUS_HEADER,
  fromStoredHtmlResponse,
  getHtmlCacheKey,
  isCacheableHtmlResponse,
  toStoredHtmlResponse,
} from './setup/html-cache'
import { appendVaryHeader, detectServerLocale } from './setup/locale'
import { finishServerTimingSpan, setServerTimingHeader, startServerTimingSpan } from './setup/server-timing'

type WorkerExecutionContext = { waitUntil(promise: Promise<unknown>): void }

const BUILD_ID = import.meta.env.VITE_GIT_COMMIT as string | undefined

const startHandler = createStartHandler(async ({ request, router, responseHeaders }) => {
  const ssrTiming = startServerTimingSpan('ssr')
  const setupTiming = startServerTimingSpan('ssr_setup')
  const locale = detectServerLocale(request)

  responseHeaders.set('Content-Language', locale)
  appendVaryHeader(responseHeaders, 'Cookie')
  appendVaryHeader(responseHeaders, 'Accept-Language')
  applyAgentDiscoveryHeaders(responseHeaders)

  const setupMetric = finishServerTimingSpan(setupTiming)
  const ssrResponse = await renderRouterToStream({
    request,
    router,
    responseHeaders,
    children: createElement(StartServer, { router }),
  })

  applyAgentDiscoveryHeaders(ssrResponse.response.headers)
  setServerTimingHeader(ssrResponse.response.headers, [setupMetric, finishServerTimingSpan(ssrTiming)])

  return ssrResponse
})

// Serve anonymous page HTML from the data center's cache before touching the router, so a hit also skips loading
// the route chunks and the song catalog on a cold isolate. See setup/html-cache.ts for what is cacheable.
async function handleWithHtmlCache(request: Request, env: unknown, ctx: WorkerExecutionContext | undefined) {
  const render = () => startHandler(request, env as Parameters<typeof startHandler>[1])
  const cacheKey = typeof caches === 'undefined' ? null : getHtmlCacheKey(request, BUILD_ID)
  if (!cacheKey || !ctx) return render()

  const cache = (caches as unknown as { default: Cache }).default
  const cached = await cache.match(cacheKey)
  if (cached) return await fromStoredHtmlResponse(cached)

  const response = await render()
  if (!isCacheableHtmlResponse(response)) return response

  const [visitorBody, storedBody] = response.body ? response.body.tee() : [null, null]
  const stored = toStoredHtmlResponse(new Response(storedBody, response))
  ctx.waitUntil(cache.put(cacheKey, stored).catch(() => undefined))

  const visitorResponse = new Response(visitorBody, response)
  visitorResponse.headers.set(HTML_CACHE_STATUS_HEADER, 'MISS')
  return visitorResponse
}

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request, ...rest: unknown[]) {
    const [env, ctx] = rest as [unknown, WorkerExecutionContext | undefined]
    return handleWithHtmlCache(request, env, ctx)
  },
})

// @sentry/cloudflare initializes per request inside the handler; a global Sentry.init would do I/O at module scope,
// which the Workers runtime rejects at startup.
export default Sentry.withSentry(
  () => ({
    dsn: 'https://9346c04036724f129e00a750c8ab9415@o4506648698683392.ingest.us.sentry.io/4511398317064192',
    // The Vite plugin injects the same release used for artifact uploads.
    release: (globalThis as { SENTRY_RELEASE?: { id?: string } }).SENTRY_RELEASE?.id,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'development',
    enabled: import.meta.env.PROD,
    tracesSampleRate: 0.2,
  }),
  // The TanStack entry is not typed as a Cloudflare ExportedHandler, but it receives (request, env, ctx).
  createServerEntry(requestHandler) as unknown as Parameters<typeof Sentry.withSentry>[1],
)