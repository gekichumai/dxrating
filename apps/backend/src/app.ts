import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createMiddleware } from 'hono/factory'
import { routePath } from 'hono/route'
import { cors } from 'hono/cors'
import { etag, RETAINED_304_HEADERS } from 'hono/etag'
import { z } from 'zod'
import { Authentication } from './auth'
import { viewerFromSession } from './proofs/viewer-is'
import { Clock, Data, Effect, Option } from 'effect'
import { HttpBody } from 'effect/http'
import { appRuntime, runApp, superviseApp } from './runtime'
import { refuseWhileDraining } from './lifecycle'
import { ClientClosedRequestError, isExpectedRequestEnd } from './request-runner'
import { HttpClient } from './services/http-client'
import { getBuildInfo } from './version'
import type { SongCatalogSource } from '@gekichumai/maimai-domain'
import { createOneshotHandler } from './services/functions/oneshot-renderer/index'
import {
  v0Handler as fetchNetRecordsV0Handler,
  v1Handler as fetchNetRecordsV1Handler,
} from './services/functions/fetch-net-records/index'
import { evlog, type EvlogVariables } from 'evlog/hono'
import type { MiddlewareHandler } from 'hono'
import { drain } from './logger'
import { appRouter, type ApiContext } from './router'
import { AppConfig } from './config'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { COMMON_ERROR_STATUS_MAP, OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { RequestHeadersHandlerPlugin, ResponseHeadersHandlerPlugin } from '@orpc/server/plugins'
import { onError, ORPCError } from '@orpc/server'
import { netErrorTags, Sentry, shouldCaptureSentryError } from './lib/functions/sentry'
import { Database } from './db/index'
import {
  compressCatalogBody,
  createDxdataEffect,
  createPostgresDxdataEffects,
  DXDATA_CORS_OPTIONS,
  DXDATA_PATH,
} from './services/dxdata'
import { createDxdataV2Store, DXDATA_V2_CACHE_TAG, DXDATA_V2_PATH } from './services/dxdata-v2'
import {
  createCommunityOverlayHandler,
  DXDATA_V2_COMMUNITY_PATH,
  readListsThrough,
} from './services/dxdata-v2-community'
import { addPublishedDxdataToOpenApi } from './services/dxdata-openapi'
import { applyApiPolicyToOpenApi } from './services/api-policy'
import { addPublicApiExamplesToOpenApi } from './services/openapi-examples'
import {
  API_CLIENT_HEADER,
  ApiUsage,
  classifyCaller,
  classifyUserAgent,
  createRouteResolver,
  isTrackedApiPath,
  readClientId,
} from './services/api-usage'
import { appContract } from './contract'
import {
  CLOUD_SAVE_EXPECTED_USER_HEADER,
  CLOUD_SAVE_NET_IMPORT_ROUTE,
  isPublicSpecProcedure,
} from '@gekichumai/api-contract'
import { credentialHygiene, holdCredentials } from './lib/credential-hygiene'
import { netImportHandler } from './services/cloud-save/net-import-route'
import { McpCatalogSource } from './services/application'
import {
  clientKey,
  createRateLimiter,
  handleMcpRequest,
  MCP_CORS_OPTIONS,
  MCP_PATH,
  MCP_RATE_LIMIT,
  rateLimited,
} from './services/mcp/http'
import { guideResponse, guideView, isMcpHost } from './services/mcp/guide'
import { API_DOCS_CSP, API_DOCS_HTML, API_JSON_CSP, isJsonContentType } from './services/api-docs'
import { MCP_SERVER_CARD_PATH, serverCardResponse } from './services/mcp/listing'
import { McpUsage, observeMcpRequest, rateLimitedTelemetry, reportMcpInternalError } from './services/mcp/telemetry'
import { isPrefetchOrBot, McpAnalyticsService, mcpLogFields, sanitizeVia } from './services/mcp/analytics'
import { clientAddress } from './services/mcp/client-key'
import { FeatureFlags } from './services/feature-flags'
import { cloudSaveRateLimits } from './services/rate-limit'
import { exportChunks, exportHeaders, tryAcquireExportSlot } from './services/cloud-save/export'
import { orpcErrorResponse } from './lib/orpc-error-response'
import { CLOUD_SAVE_BODY_LIMIT_BYTES, CLOUD_SAVE_LARGE_BODY_LIMIT_BYTES } from './services/cloud-save/limits'
class HttpAdapterError extends Data.TaggedError('HttpAdapterError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

const app = new Hono<EvlogVariables>()

/**
 * Refuses request bodies over `maxSize` bytes with an oRPC-shaped 413: at once when `Content-Length` says so,
 * otherwise (a chunked upload) by counting the bytes as the handler reads them and answering 413 in place of
 * whatever the handler made of the cut-off body.
 */
const cloudSaveBodyLimitOf = (maxSize: number) =>
  createMiddleware(async (c, next) => {
    const tooLarge = () => {
      // The rest of the upload is not read: close the connection after the answer (Node), so a client does not send
      // its next request on a connection the server is about to drop
      const outgoing = (c.env as { outgoing?: { shouldKeepAlive?: boolean } } | undefined)?.outgoing
      if (outgoing) outgoing.shouldKeepAlive = false
      return orpcErrorResponse(
        new ORPCError('PAYLOAD_TOO_LARGE', { message: `The request body is over ${maxSize} bytes` }),
      )
    }
    const body = c.req.raw.body
    if (!body) return next()
    const contentLength = c.req.raw.headers.get('content-length')
    if (contentLength !== null && !c.req.raw.headers.has('transfer-encoding')) {
      if (Number.parseInt(contentLength, 10) > maxSize) return tooLarge()
      return next()
    }
    let size = 0
    let exceeded = false
    const counted = body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength
          if (size > maxSize) {
            exceeded = true
            controller.error(new Error('Payload Too Large'))
            return
          }
          controller.enqueue(chunk)
        },
      }),
    )
    c.req.raw = new Request(c.req.raw, { body: counted, duplex: 'half' } as RequestInit)
    await next()
    if (exceeded) {
      // keep the headers other middleware set, but not the body headers of the handler's answer
      const previous = c.res
      const response = tooLarge()
      for (const [key, value] of previous.headers) {
        if (key !== 'content-type' && key !== 'content-length' && key !== 'set-cookie') response.headers.set(key, value)
      }
      c.res = undefined
      c.res = response
    }
  })
const cloudSaveBodyLimit = cloudSaveBodyLimitOf(CLOUD_SAVE_BODY_LIMIT_BYTES)
const largeCloudSaveBodyLimit = cloudSaveBodyLimitOf(CLOUD_SAVE_LARGE_BODY_LIMIT_BYTES)
const isLargeCloudSaveUpload = (path: string) => /^\/api\/v1\/saves\/[^/]+\/(replace|client-imports)$/.test(path)

const API_CATALOG_PROFILE_URL = 'https://www.rfc-editor.org/info/rfc9727'
const API_CATALOG_CONTENT_TYPE = `application/linkset+json; profile="${API_CATALOG_PROFILE_URL}"`
const ARCADE_VENUES_PATH = '/api/v1/arcades/venues'
const ARCADE_VENUES_BROWSER_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=60, stale-if-error=86400'
// Nothing purges the edge when venues change, so it revalidates every 5 minutes in the background with the ETag.
// Longer than dxdata's 60s because each revalidation rebuilds and hashes the full body to compare ETags.
const ARCADE_VENUES_CDN_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=604800'
const ARCADE_VENUES_RETAINED_304_HEADERS = [
  ...RETAINED_304_HEADERS,
  'last-modified',
  'cdn-cache-control',
  'cloudflare-cdn-cache-control',
  'cache-tag',
  'access-control-allow-origin',
  'access-control-expose-headers',
]
const PUBLIC_STATIC_CATALOG_PATHS = new Set([ARCADE_VENUES_PATH, DXDATA_PATH, DXDATA_V2_PATH, DXDATA_V2_COMMUNITY_PATH])
// The tag and alias lists are public data that the edge shares between every caller. The edge ignores
// `Vary: Origin`, so a cached copy must not carry one caller's reflected origin: reads answer `*` without
// credentials, like the catalog. Writes on the same paths (POST /aliases) keep the credentialed API CORS.
const PUBLIC_LIST_PATHS = new Set(['/api/v1/tags', '/api/v1/aliases', '/api/v1/announcements'])
const PUBLIC_LIST_CACHE_TAGS: Record<string, string> = {
  '/api/v1/tags': 'tags',
  '/api/v1/aliases': 'aliases',
  '/api/v1/announcements': 'announcements',
}
// Browsers always revalidate, which the edge answers with a 304, so a client that refetches right after its own
// write is never held on a copy in its own cache. The edge keeps a copy for a minute and then revalidates it in the
// background, so a new tag or alias reaches everyone within a few minutes; mutations also clear the server cache.
const PUBLIC_LIST_BROWSER_CACHE_CONTROL = 'public, no-cache'
const PUBLIC_LIST_CDN_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300, stale-if-error=86400'
const PUBLIC_LIST_RETAINED_304_HEADERS = [
  ...RETAINED_304_HEADERS,
  'cdn-cache-control',
  'cloudflare-cdn-cache-control',
  'cache-tag',
  'access-control-allow-origin',
  'access-control-expose-headers',
]
const isPublicListRead = (c: Context) => {
  if (!PUBLIC_LIST_PATHS.has(c.req.path)) return false
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return true
  if (c.req.method !== 'OPTIONS') return false
  const requested = c.req.header('Access-Control-Request-Method')?.toUpperCase()
  return requested === undefined || requested === 'GET' || requested === 'HEAD'
}

const getFirstHeaderValue = (value: string | undefined) => value?.split(',')[0]?.trim() || undefined

const getValidProtocol = (value: string | undefined) => {
  const protocol = value?.toLowerCase()
  return protocol === 'http' || protocol === 'https' ? protocol : undefined
}

const isValidHost = (host: string | undefined) => {
  if (!host || /[\s/@\\]/.test(host)) return false

  try {
    const url = new URL(`https://${host}`)
    return url.hostname.length > 0 && url.pathname === '/' && !url.search && !url.hash
  } catch {
    return false
  }
}

const getRequestOrigin = (c: Context) => {
  const requestUrl = new URL(c.req.url)
  const forwardedProtocol = getValidProtocol(getFirstHeaderValue(c.req.header('x-forwarded-proto')))
  const forwardedHost = getFirstHeaderValue(c.req.header('x-forwarded-host'))
  const hostHeader = getFirstHeaderValue(c.req.header('host'))

  const protocol = forwardedProtocol ?? requestUrl.protocol.replace(/:$/, '')
  const host = isValidHost(forwardedHost) ? forwardedHost : isValidHost(hostHeader) ? hostHeader : requestUrl.host

  return `${protocol}://${host}`
}

const buildApiCatalog = (origin: string) => ({
  linkset: [
    {
      anchor: `${origin}/api/v1`,
      'service-desc': [
        {
          href: `${origin}/spec.json`,
          type: 'application/vnd.oai.openapi+json',
        },
      ],
      'service-doc': [
        {
          href: `${origin}/docs`,
          type: 'text/html',
        },
        {
          href: 'https://dxrating.net/developers',
          type: 'text/html',
        },
      ],
      describedby: [
        {
          href: 'https://dxrating.net/llms.txt',
          type: 'text/markdown',
        },
      ],
      status: [
        {
          href: `${origin}/health`,
          type: 'application/json',
        },
      ],
    },
  ],
})

const setApiCatalogHeaders = (c: Context) => {
  c.header('Content-Type', API_CATALOG_CONTENT_TYPE)
  c.header('Vary', 'Host, X-Forwarded-Host, X-Forwarded-Proto')
  c.header(
    'Link',
    [
      `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"; profile="${API_CATALOG_PROFILE_URL}"`,
      '</spec.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
      '</docs>; rel="service-doc"; type="text/html"',
      '<https://dxrating.net/developers>; rel="service-doc"; type="text/html"',
      '<https://dxrating.net/llms.txt>; rel="describedby"; type="text/markdown"',
    ].join(', '),
  )
}

/**
 * A request that ended because the client closed the connection (nobody reads this response; 499 is nginx's code
 * for it) or because the server is shutting down (503, so the proxy retries elsewhere). Logged at info, not sent to
 * Sentry: neither is a server fault.
 */
const expectedRequestEnd = (c: Context, error: Error) => {
  c.get('log')?.info({ request_end: error.name })
  if (error instanceof ClientClosedRequestError) return c.body(null, 499 as 400)
  c.header('Connection', 'close')
  return c.json({ status: 'shutting_down' }, 503)
}

// Error handler
app.onError((err, c) => {
  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined

  if (err instanceof z.ZodError) {
    return c.json({ error: 'Validation error', details: err.issues, requestId }, 400)
  }

  // The client left before the response finished, or shutdown stopped the request: expected, not reported.
  if (isExpectedRequestEnd(err)) return expectedRequestEnd(c, err)

  log?.error(err)
  Sentry.captureException(err, { tags: { requestId } })

  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  return c.json({ error: 'Internal server error', requestId }, 500)
})

const apiCors = cors({
  origin: (origin) => {
    // Allow local development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin
    }

    // Allow production domain and preview deployments
    if (
      origin === 'https://dxrating.net' ||
      origin.endsWith('.dxrating.pages.dev') ||
      origin.endsWith('.galvin.workers.dev')
    ) {
      return origin
    }

    return null
  },
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'sentry-trace',
    'baggage',
    'x-captcha-response',
    API_CLIENT_HEADER,
    CLOUD_SAVE_EXPECTED_USER_HEADER,
  ],
  // PATCH and DELETE: cloud save routes (rename and delete a save)
  allowMethods: ['POST', 'GET', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'X-DXRating-Request-ID'],
  maxAge: 600,
  credentials: true,
})

const publicStaticCatalogCors = cors(DXDATA_CORS_OPTIONS)
const publicListCors = cors({
  origin: '*',
  // The web sends Sentry trace headers to the API (router.tsx tracePropagationTargets)
  allowHeaders: ['Content-Type', 'If-None-Match', 'sentry-trace', 'baggage', API_CLIENT_HEADER],
  allowMethods: ['GET', 'HEAD', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'ETag', 'X-DXRating-Request-ID'],
  maxAge: 86400,
})
const mcpCors = cors(MCP_CORS_OPTIONS)

// While the server drains on shutdown, readiness (/health) fails and new requests are refused; in-flight ones finish.
app.use('*', refuseWhileDraining)

// Static catalog responses are credential-independent, allowing one public
// representation per URL to be safely shared by browsers and the CDN. The MCP
// server is read-only and takes no credentials, so any origin may call it.
app.use('*', (c, next) =>
  PUBLIC_STATIC_CATALOG_PATHS.has(c.req.path)
    ? publicStaticCatalogCors(c, next)
    : isPublicListRead(c)
      ? publicListCors(c, next)
      : c.req.path === MCP_PATH || c.req.path === MCP_SERVER_CARD_PATH
        ? mcpCors(c, next)
        : apiCors(c, next),
)

// Request logging
app.use(
  '*',
  evlog({
    drain,
    exclude: [
      '/health',
      '/version',
      '/robots.txt',
      '/docs',
      '/spec.json',
      '/',
      '/.well-known/api-catalog',
      '/api/v1/monitoring/tunnel',
    ],
  }) as unknown as MiddlewareHandler,
)

// Credential hygiene (design §7.2): the routes that carry a SEGA ID and password (or LXNS tokens) never log or report
// them. Right after evlog, so their request logger is the scrubbing one.
for (const path of [
  '/functions/fetch-net-records/*',
  '/api/v1/io/import/maimai-net',
  '/api/v1/io/import/lxns/*',
  CLOUD_SAVE_NET_IMPORT_ROUTE.honoPath,
  '/api/v1/saves/:id/imports/lxns',
]) {
  app.use(path, credentialHygiene)
}

// API usage accounting: classify each request by route template and caller,
// attach the result to the request wide event, and add it to the per-minute
// rollup flushed by the ApiUsage service.
const resolveApiRoute = createRouteResolver(appContract)

app.use('*', (c, next) => {
  if (!isTrackedApiPath(c.req.path)) return next()

  const startedAt = performance.now()
  return runApp(
    Effect.gen(function* () {
      const usage = yield* ApiUsage
      // Evaluated after `next()`: `routePath(c)` then names the handler that
      // produced the response, not merely the last route pattern that matched.
      const record = Effect.suspend(() => {
        const request = {
          route: resolveApiRoute(c.req.method, c.req.path, routePath(c)),
          method: c.req.method,
          status: c.res.status,
          caller: classifyCaller(c.req.header('origin'), c.req.header('referer')),
          userAgentClass: classifyUserAgent(c.req.header('user-agent')),
          clientId: readClientId(c.req.header(API_CLIENT_HEADER)),
        }
        c.get('log')?.set({
          api: {
            route: request.route,
            caller: request.caller,
            ua_class: request.userAgentClass,
            client_id: request.clientId,
          },
        })
        return usage.record(request, performance.now() - startedAt)
      })
      yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run API usage middleware', cause }),
      }).pipe(Effect.ensuring(record))
    }),
    { signal: c.req.raw.signal },
  )
})

// Set X-DXRating-Request-ID response header
app.use('*', (c, next) =>
  runApp(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run HTTP middleware', cause }),
      })
      const log = c.get('log')
      const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined
      if (requestId && !PUBLIC_STATIC_CATALOG_PATHS.has(c.req.path)) {
        c.header('X-DXRating-Request-ID', requestId)
      }
    }),
    { signal: c.req.raw.signal },
  ),
)

// The setup guide of the MCP server, on its host only (mcp.dxrating.net): its
// root, /index.md, /llms.txt and /robots.txt. Other hosts fall through.
app.use('*', async (c, next) => {
  const response = guideResponse(c.req.raw)
  if (!response) return next()
  const view = response.ok ? guideView(c.req.raw) : undefined
  const headers = c.req.raw.headers
  if (view && !isPrefetchOrBot(headers)) {
    const socketAddress = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming
      ?.socket?.remoteAddress
    const address = clientAddress(headers, socketAddress)
    // queued only, after the response: a failure of analytics never reaches the visitor
    void runApp(
      Effect.map(McpAnalyticsService, (analytics) =>
        analytics.captureGuideView({
          headers,
          clientAddress: address,
          ...view,
          deployment: process.env.NODE_ENV ?? 'development',
        }),
      ),
    ).catch(() => undefined)
  }
  return response
})

// A conservative Content-Security-Policy for the JSON responses of the API, which load and run nothing; /docs sets
// its own. The MCP host is left alone: its guide sets its own hashed policy, and answers before this middleware.
app.use('*', async (c, next) => {
  await next()
  if (isMcpHost(c.req.raw.headers) || c.res.headers.has('Content-Security-Policy')) return
  if (!isJsonContentType(c.res.headers.get('Content-Type'))) return
  try {
    c.res.headers.set('Content-Security-Policy', API_JSON_CSP)
  } catch {
    // The headers of a response passed through from fetch are immutable.
    c.res = new Response(c.res.body, c.res)
    c.res.headers.set('Content-Security-Policy', API_JSON_CSP)
  }
})

// Root redirect to docs
app.get('/', (c) => c.redirect('/docs'))

// Health endpoint
app.get('/health', (c) => c.json({ status: 'ok' }))

// API catalog for automated API discovery (RFC 9727)
app.get('/.well-known/api-catalog', (c) => {
  setApiCatalogHeaders(c)
  return c.body(JSON.stringify(buildApiCatalog(getRequestOrigin(c))), 200)
})

app.on('HEAD', '/.well-known/api-catalog', (c) => {
  setApiCatalogHeaders(c)
  return c.body(null, 200)
})

// MCP server for AI assistants: read-only, stateless, no authentication. Its
// catalog is in memory (McpCatalogSource), so tool calls do not query the
// database beyond a check of the publication pointer once a minute.
const mcpRateLimiter = createRateLimiter(MCP_RATE_LIMIT)

app.on(['GET', 'POST', 'DELETE'], MCP_PATH, (c) => {
  const socketAddress = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket
    ?.remoteAddress
  const headers = c.req.raw.headers
  const retryAfter = mcpRateLimiter.take(clientKey(headers, socketAddress))
  const address = clientAddress(headers, socketAddress)
  const via = sanitizeVia(c.req.query('via'))
  return runApp(
    Effect.gen(function* () {
      const usage = yield* McpUsage
      const analytics = yield* McpAnalyticsService
      if (retryAfter > 0) {
        const telemetry = rateLimitedTelemetry(headers)
        c.get('log')?.set(telemetry.event)
        c.get('log')?.set(mcpLogFields({ headers, clientAddress: address, via }))
        yield* usage.record(telemetry)
        return rateLimited(retryAfter)
      }
      // Before the first catalog is loaded the server still answers, and its
      // tools say that the data is loading.
      const catalog = yield* Effect.flatMap(McpCatalogSource, (source) => source.current).pipe(
        Effect.orElseSucceed(() => undefined),
      )
      const { response, telemetry, requestBody, responseBody } = yield* Effect.tryPromise({
        try: () => observeMcpRequest(c.req.raw, (request) => handleMcpRequest(request, catalog)),
        catch: (cause) => new HttpAdapterError({ operation: 'Handle MCP request', cause }),
      })
      c.get('log')?.set(mcpLogFields({ headers, clientAddress: address, via, requestBody }))
      if (telemetry) {
        c.get('log')?.set(telemetry.event)
        yield* usage.record(telemetry)
        reportMcpInternalError(telemetry, address, via)
        // queued only: the response never waits for PostHog
        analytics.capture(
          {
            headers,
            clientAddress: address,
            via,
            durationMs: telemetry.durationMs,
            status: response.status,
            deployment: process.env.NODE_ENV ?? 'development',
          },
          requestBody,
          responseBody,
        )
      }
      return response
    }),
    { signal: c.req.raw.signal },
  )
})

// The MCP Server Card, which clients and directories fetch before connecting
app.on(['GET', 'HEAD'], MCP_SERVER_CARD_PATH, (c) => serverCardResponse(c.req.method))

// Build provenance endpoint
app.get('/version', (c) =>
  runApp(
    Effect.map(getBuildInfo, (info) => c.json(info)),
    { signal: c.req.raw.signal },
  ),
)

// BetterAuth
app.on(['POST', 'GET'], '/api/auth/**', (c) => {
  return runApp(
    Effect.flatMap(Authentication, (auth) => auth.handle(c.req.raw)),
    { signal: c.req.raw.signal },
  )
})

// Middleware: validate auth params for fetch-net-records
const authParamsSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1),
  region: z.enum(['jp', 'intl']),
})

const verifyParams = createMiddleware((c, next) =>
  runApp(
    Effect.gen(function* () {
      // A body that is not JSON is a plain 400, its parse error dropped: V8's SyntaxError quotes the text around the
      // bad token, which can be the SEGA ID or password (design §7.2)
      const body = yield* Effect.tryPromise({
        try: () => c.req.json<unknown>(),
        catch: () => null,
      }).pipe(Effect.orElseSucceed(() => undefined))
      const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
      const region = c.req.param('region') ?? fields.region

      const result = authParamsSchema.safeParse({ id: fields.id, password: fields.password, region })
      if (!result.success) {
        return c.json({ error: 'Invalid parameters', details: result.error.issues }, 400)
      }

      c.set('authParams', { id: result.data.id, password: result.data.password })
      c.set('region', result.data.region)
      // Filtered from telemetry while the handler runs, whatever the body's framing (design §7.2): the middleware's
      // read-ahead only sees small bodies with a Content-Length. Streaming handlers hold their own.
      const releaseCredentials = holdCredentials([result.data.id, result.data.password])
      return yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run NET handler', cause }),
      }).pipe(Effect.ensuring(Effect.sync(releaseCredentials)))
    }),
    { signal: c.req.raw.signal },
  ),
)

// Sentry tunnel — accepts raw envelope body, proxies as-is
const SENTRY_ALLOWED_DSN_TARGETS = new Set([
  'o4506648698683392.ingest.sentry.io/4506648709627904',
  'o4506648698683392.ingest.us.sentry.io/4511398317064192',
])
const MAX_TUNNEL_BODY_SIZE = 20 * 1024 * 1024 // 20 MB

app.post('/api/v1/monitoring/tunnel', (c) =>
  runApp(
    Effect.gen(function* () {
      const contentLength = Number(c.req.header('content-length') ?? 0)
      if (contentLength > MAX_TUNNEL_BODY_SIZE) return c.json({ error: 'Payload too large' }, 413)
      const envelope = yield* Effect.tryPromise({
        try: () => c.req.text(),
        catch: (cause) => new HttpAdapterError({ operation: 'Read Sentry envelope', cause }),
      })
      if (Buffer.byteLength(envelope) > MAX_TUNNEL_BODY_SIZE) return c.json({ error: 'Payload too large' }, 413)
      const parsed = yield* Effect.try(() => {
        const header = JSON.parse(envelope.split('\n')[0])
        return new URL(header.dsn)
      }).pipe(Effect.option)
      if (Option.isNone(parsed)) return c.body(null, 200)
      const dsn = parsed.value
      const projectId = dsn.pathname.replace('/', '')
      if (!SENTRY_ALLOWED_DSN_TARGETS.has(`${dsn.hostname}/${projectId}`)) {
        return c.json({ error: 'Invalid Sentry DSN' }, 400)
      }
      const http = yield* HttpClient
      yield* http
        .post(`https://${dsn.hostname}/api/${projectId}/envelope/`, {
          body: HttpBody.raw(envelope),
        })
        .pipe(
          Effect.flatMap((response) => response.text),
          Effect.catch(() => Effect.void),
        )
      return c.body(null, 200)
    }),
    { signal: c.req.raw.signal },
  ),
)

// Functions
app.post('/functions/fetch-net-records/v0', verifyParams, fetchNetRecordsV0Handler)
app.post('/functions/fetch-net-records/v1/:region', verifyParams, fetchNetRecordsV1Handler)
app.post(
  '/functions/render-oneshot/v0',
  createOneshotHandler(() =>
    runApp(
      Effect.flatMap(McpCatalogSource, (source) => source.current).pipe(
        Effect.map((catalog) => ({ revision: catalog.catalogRunId, document: catalog.document as SongCatalogSource })),
      ),
    ),
  ),
)

// LXNS OAuth callback (direct Hono route — must be before oRPC catch-all since it redirects)
app.get('/api/v1/io/import/lxns/oauth_callback', (c) =>
  runApp(
    Effect.gen(function* () {
      const code = c.req.query('code')
      const state = c.req.query('state')
      const error = c.req.query('error')
      const config = yield* AppConfig
      const frontendCallback = `${config.frontendUrl}/io/import/lxns/oauth_callback`
      if (error || !code || !state) {
        return c.redirect(`${frontendCallback}?status=error&error=${encodeURIComponent(error || 'missing_params')}`)
      }
      // Completing needs the session of the user who started the authorization, which this redirect from LXNS may
      // not carry (the iOS app signs in with its own cookie store). The web page or the app calls lxns.complete.
      return c.redirect(`${frontendCallback}?${new URLSearchParams({ code, state }).toString()}`)
    }),
    { signal: c.req.raw.signal },
  ),
)

const superviseApi: NonNullable<ApiContext['effect/wrap']> = (effect, { path }) =>
  superviseApp(effect.pipe(Effect.withSpan(`api.${path.join('.')}`)))

// oRPC OpenAPI handler
const openAPIHandler = new OpenAPIHandler(appRouter, {
  // Existing browser and mobile clients consume the v1 status field.
  customErrorResponseBodyEncoder: (error) => ({
    ...error.toJSON(),
    status: COMMON_ERROR_STATUS_MAP[error.code as keyof typeof COMMON_ERROR_STATUS_MAP] ?? 500,
  }),
  plugins: [new RequestHeadersHandlerPlugin<ApiContext>(), new ResponseHeadersHandlerPlugin<ApiContext>()],
  clientInterceptors: [
    onError((error, { path }) => {
      if (!shouldCaptureSentryError(error)) return

      const procedureName = path.join('.')
      console.error(`[oRPC] ${procedureName} failed:`, error)
      Sentry.captureException(error, {
        tags: { 'orpc.procedure': procedureName, ...netErrorTags(error) },
      })
    }),
  ],
})

// oRPC OpenAPI generator for spec
const openAPIGenerator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
})

app.get('/robots.txt', (c) => c.text('User-agent: *\\nDisallow: /'))

export const dxdataStore = createPostgresDxdataEffects((text, values) =>
  Effect.flatMap(Database, (database) => database.raw('Read published catalog', text, values)),
)
const reportCatalogError = (error: unknown, c: Context<EvlogVariables>) => {
  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined
  log?.error(error instanceof Error ? error : new Error(String(error)))
  Sentry.captureException(error, { tags: { requestId } })
}
const dxdataHandler = createDxdataEffect(dxdataStore, reportCatalogError)
// v2 (gekichumai/meta#43): the same publication, transformed once per published body
const dxdataV2Handler = createDxdataEffect(
  createDxdataV2Store(dxdataStore),
  reportCatalogError,
  compressCatalogBody,
  DXDATA_V2_CACHE_TAG,
)

// The producer atomically advances the production publication pointer. Read
// its small metadata row first so HEAD and conditional requests never fetch
// the potentially large snapshot body.
app.on(['GET', 'HEAD'], DXDATA_PATH, (c) => runApp(dxdataHandler(c), { signal: c.req.raw.signal }))
app.on(['GET', 'HEAD'], DXDATA_V2_PATH, (c) => runApp(dxdataV2Handler(c), { signal: c.req.raw.signal }))

// The v2 community overlay, built from the public v1 tag and alias routes themselves, so it follows their rules
const communityOverlayHandler = createCommunityOverlayHandler(
  readListsThrough((path) => app.request(path, { headers: { [API_CLIENT_HEADER]: 'dxrating-v2-community' } })),
  reportCatalogError,
)
app.on(['GET', 'HEAD'], DXDATA_V2_COMMUNITY_PATH, (c) =>
  runApp(communityOverlayHandler(c), { signal: c.req.raw.signal }),
)

const arcadeVenuesCacheHeaders = createMiddleware((c, next) =>
  runApp(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run arcade handler', cause }),
      })
      if (c.res.status !== 200) return

      const database = yield* Database
      const result = yield* database.raw<{ last_modified: Date | null }>(
        'Read arcade modification date',
        `
    SELECT max(last_modified) AS last_modified
    FROM (
      SELECT max(updated_at) AS last_modified FROM arcade.venues
      UNION ALL
      SELECT max(updated_at) AS last_modified FROM arcade.installations
      UNION ALL
      SELECT max(created_at) AS last_modified FROM arcade.installation_identities
      UNION ALL
      SELECT max(updated_at) AS last_modified FROM arcade.games
      UNION ALL
      SELECT max(updated_at) AS last_modified FROM arcade.chains
    ) AS catalog_timestamps
  `,
      )
      const lastModified = result.rows[0]?.last_modified
      if (lastModified) c.header('Last-Modified', lastModified.toUTCString())

      c.header('Cache-Control', ARCADE_VENUES_BROWSER_CACHE_CONTROL)
      c.header('CDN-Cache-Control', ARCADE_VENUES_CDN_CACHE_CONTROL)
      c.header('Cloudflare-CDN-Cache-Control', ARCADE_VENUES_CDN_CACHE_CONTROL)
      c.header('Cache-Tag', 'arcade-venues')
    }),
    { signal: c.req.raw.signal },
  ),
)

const stripWeakEtag = (value: string) => value.trim().replace(/^W\//, '')

const arcadeVenuesEtag = createMiddleware((c, next) =>
  runApp(
    Effect.gen(function* () {
      const ifNoneMatch = c.req.header('If-None-Match')
      yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run arcade cache middleware', cause }),
      })

      // Validation errors and server errors are not stable catalog
      // representations and must never turn into conditional 304 responses.
      if (c.res.status !== 200) {
        c.res.headers.delete('ETag')
        return
      }

      const response = c.res
      const body = yield* Effect.tryPromise({
        try: () => response.clone().arrayBuffer(),
        catch: (cause) => new HttpAdapterError({ operation: 'Read arcade response', cause }),
      })
      const digest = yield* Effect.tryPromise({
        try: () => crypto.subtle.digest('SHA-256', body),
        catch: (cause) => new HttpAdapterError({ operation: 'Hash arcade response', cause }),
      })
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
      const responseEtag = `"${hash}"`
      const matches =
        ifNoneMatch?.trim() === '*' ||
        ifNoneMatch?.split(',').some((candidate) => stripWeakEtag(candidate) === stripWeakEtag(responseEtag)) === true

      if (!matches) {
        c.res.headers.set('ETag', responseEtag)
        return
      }

      const headers = new Headers()
      for (const name of ARCADE_VENUES_RETAINED_304_HEADERS) {
        const value = response.headers.get(name)
        if (value !== null) headers.set(name, value)
      }
      headers.set('ETag', responseEtag)
      c.res = new Response(null, { status: 304, statusText: 'Not Modified', headers })
    }),
    { signal: c.req.raw.signal },
  ),
)

// This exact public route bypasses Better Auth's session lookup. Filtered
// compatibility requests still receive validators, while the CDN Cache Rule
// only marks the canonical query-less catalog eligible for edge storage.
const reportApiError = (c: Context, error: unknown) => {
  if (isExpectedRequestEnd(error)) return expectedRequestEnd(c, error as Error)
  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined
  log?.error(error instanceof Error ? error : new Error(String(error)))
  Sentry.captureException(error, { tags: { requestId } })
  return c.json({ error: 'Internal server error', requestId }, 500)
}

app.get(ARCADE_VENUES_PATH, arcadeVenuesEtag, arcadeVenuesCacheHeaders, (c) =>
  runApp(
    Effect.gen(function* () {
      const effectContext = yield* appRuntime.contextEffect
      return yield* Effect.tryPromise({
        try: () =>
          openAPIHandler.handle(c.req.method === 'HEAD' ? new Request(c.req.raw, { method: 'GET' }) : c.req.raw, {
            prefix: '/api/v1',
            context: { 'effect/context': effectContext, 'effect/wrap': superviseApi, signal: c.req.raw.signal },
          }),
        catch: (cause) => new HttpAdapterError({ operation: 'Handle public arcade API', cause }),
      })
    }).pipe(
      Effect.flatMap(({ response }) =>
        response ? Effect.succeed(response) : Effect.promise(() => Promise.resolve(c.notFound())),
      ),
      Effect.catch((error) => Effect.sync(() => reportApiError(c, error.cause))),
    ),
    { signal: c.req.raw.signal },
  ),
)

// The tag and alias lists are the same for every viewer, and bots poll them; an ETag lets a poller revalidate with
// If-None-Match and get a 304 instead of the whole list. The API stability policy asks clients to do so. The edge
// keeps them as well (see PUBLIC_LIST_CDN_CACHE_CONTROL), so the 304 keeps the headers it needs to renew its copy.
const publicListEtag = etag({ retainedHeaders: PUBLIC_LIST_RETAINED_304_HEADERS })
const publicListCacheHeaders = createMiddleware(async (c, next) => {
  await next()
  if (c.res.status !== 200) return
  c.header('Cache-Control', PUBLIC_LIST_BROWSER_CACHE_CONTROL)
  c.header('CDN-Cache-Control', PUBLIC_LIST_CDN_CACHE_CONTROL)
  c.header('Cloudflare-CDN-Cache-Control', PUBLIC_LIST_CDN_CACHE_CONTROL)
  c.header('Cache-Tag', PUBLIC_LIST_CACHE_TAGS[c.req.path] ?? 'aliases')
})
for (const path of PUBLIC_LIST_PATHS) {
  app.on(['GET', 'HEAD'], path, publicListEtag, publicListCacheHeaders)
}

// Comment and /me responses depend on the signed-in viewer and must never enter a shared cache.
const viewerPrivateCacheHeaders = createMiddleware((c, next) =>
  runApp(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run viewer-dependent handler', cause }),
      })
      c.header('Cache-Control', 'private, no-store')
      c.header('CDN-Cache-Control', 'no-store')
      c.header('Cloudflare-CDN-Cache-Control', 'no-store')
      c.header('Vary', 'Cookie, Authorization, Origin')
    }),
    { signal: c.req.raw.signal },
  ),
)
for (const path of [
  '/api/v1/comments',
  '/api/v1/me',
  '/api/v1/me/*',
  '/api/v1/saves',
  '/api/v1/saves/*',
  '/api/v1/imports/*',
]) {
  app.use(path, viewerPrivateCacheHeaders)
}

// Cloud save request bodies (design §11.4): 2 MB for whole-save uploads, 1 MB for everything else.
for (const path of ['/api/v1/saves', '/api/v1/saves/*', '/api/v1/imports/*', '/api/v1/me/*']) {
  app.use(path, (c, next) =>
    (isLargeCloudSaveUpload(c.req.path) ? largeCloudSaveBodyLimit : cloudSaveBodyLimit)(c, next),
  )
}

// The cloud save export streams (§11.3): it is answered here, ahead of the oRPC handler, with the same session,
// feature flag and rate limit rules as the `cloudSave.export` procedure.
// Both spellings: the oRPC router would also match `/me/export/`, and only this route streams.
/** The `Retry-After` of an export refused because every export slot is taken */
const EXPORT_BUSY_RETRY_AFTER_SECONDS = 5
const streamExport = (c: Context) =>
  runApp(
    Effect.gen(function* () {
      const auth = yield* Authentication
      const session = yield* auth.session(c.req.raw.headers)
      if (!session?.user) return orpcErrorResponse(new ORPCError('UNAUTHORIZED'))
      const featureFlags = yield* FeatureFlags
      if (!(yield* featureFlags.isEnabled('cloud_save', session.user.id))) {
        return orpcErrorResponse(new ORPCError('NOT_FOUND'))
      }
      // HEAD (which Hono answers through this GET handler, dropping the body unread) starts no export: the headers
      // describe a download made now, and no transaction, slot or daily export is used
      if (c.req.method === 'HEAD') {
        return new Response(null, { status: 200, headers: exportHeaders(new Date(yield* Clock.currentTimeMillis)) })
      }
      const takenAt = Date.now()
      const retryAfterSeconds = cloudSaveRateLimits.export.take(session.user.id, 1, takenAt)
      if (retryAfterSeconds > 0) {
        return orpcErrorResponse(
          new ORPCError('TOO_MANY_REQUESTS', {
            message: `Too many requests. Retry in ${retryAfterSeconds} seconds.`,
            data: { retryAfterSeconds },
          }),
          { 'Retry-After': String(retryAfterSeconds) },
        )
      }
      // Each running export holds a pooled connection for its snapshot: beyond the slots, a busy answer that costs
      // the user nothing
      const release = tryAcquireExportSlot()
      if (!release) {
        cloudSaveRateLimits.export.refund(session.user.id, 1, takenAt)
        return orpcErrorResponse(
          new ORPCError('TOO_MANY_REQUESTS', {
            message: `Too many exports running. Retry in ${EXPORT_BUSY_RETRY_AFTER_SECONDS} seconds.`,
            data: { retryAfterSeconds: EXPORT_BUSY_RETRY_AFTER_SECONDS },
          }),
          { 'Retry-After': String(EXPORT_BUSY_RETRY_AFTER_SECONDS) },
        )
      }
      const database = yield* Database
      const exportedAt = new Date(yield* Clock.currentTimeMillis)
      const signal = c.req.raw.signal
      // The slot is the transaction's: freed when it ends, which the idle deadline bounds even if nobody reads
      const chunks = exportChunks((effect) => runApp(effect, { signal }), database, session.user.id, exportedAt, {
        onSettled: release,
      })
      const encoder = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const next = await chunks.next()
          if (next.done) controller.close()
          else controller.enqueue(encoder.encode(next.value))
        },
        async cancel() {
          await chunks.return(undefined)
        },
      })
      return new Response(body, { status: 200, headers: exportHeaders(exportedAt) })
    }),
    { signal: c.req.raw.signal },
  )
for (const path of ['/api/v1/me/export', '/api/v1/me/export/']) app.get(path, streamExport)

// The maimai NET server import streams progress over SSE (design §5.1, §7.1), so it is a direct route ahead of the
// oRPC handler, with the same session, flag and rate-limit rules as the cloud save procedures.
app.post(CLOUD_SAVE_NET_IMPORT_ROUTE.honoPath, netImportHandler)

app.all('/api/v1/*', (c) =>
  runApp(
    Effect.gen(function* () {
      const auth = yield* Authentication
      const session = yield* auth.session(c.req.raw.headers)
      const effectContext = yield* appRuntime.contextEffect
      const { response } = yield* Effect.tryPromise({
        try: () =>
          openAPIHandler.handle(c.req.raw, {
            prefix: '/api/v1',
            context: {
              'effect/context': effectContext,
              'effect/wrap': superviseApi,
              user: session?.user,
              viewer: session?.user ? viewerFromSession(session.user) : undefined,
              signal: c.req.raw.signal,
            },
          }),
        catch: (cause) => new HttpAdapterError({ operation: 'Handle API request', cause }),
      })
      return response ?? (yield* Effect.promise(() => Promise.resolve(c.notFound())))
    }).pipe(Effect.catch((error) => Effect.sync(() => reportApiError(c, error.cause)))),
    { signal: c.req.raw.signal },
  ),
)

app.get('/spec.json', (c) =>
  runApp(
    Effect.gen(function* () {
      const spec = yield* Effect.tryPromise({
        try: () =>
          openAPIGenerator.generate(appRouter, {
            version: '3.1.1',
            base: {
              info: {
                title: 'DXRating API',
                version: '1.0.0',
              },
              servers: [{ url: '/api/v1' }],
              security: [{ bearerAuth: [] }],
              components: {
                securitySchemes: {
                  bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                  },
                },
              },
            },
            filter: isPublicSpecProcedure,
          }),
        catch: (cause) => new HttpAdapterError({ operation: 'Generate OpenAPI specification', cause }),
      })
      return c.json(applyApiPolicyToOpenApi(addPublicApiExamplesToOpenApi(addPublishedDxdataToOpenApi(spec))))
    }),
    { signal: c.req.raw.signal },
  ),
)

// Serve Scalar API documentation
app.get('/docs', (c) => {
  c.header('Content-Security-Policy', API_DOCS_CSP)
  c.header('X-Frame-Options', 'DENY')
  return c.html(API_DOCS_HTML)
})

export { app }