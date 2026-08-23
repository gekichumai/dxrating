import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createMiddleware } from 'hono/factory'
import { cors } from 'hono/cors'
import { RETAINED_304_HEADERS } from 'hono/etag'
import { z } from 'zod'
import { auth } from './auth.js'
import { handler as oneshotRenderer } from './services/functions/oneshot-renderer/index.js'
import {
  v0Handler as fetchNetRecordsV0Handler,
  v1Handler as fetchNetRecordsV1Handler,
} from './services/functions/fetch-net-records/index.js'
import { evlog, type EvlogVariables } from 'evlog/hono'
import type { MiddlewareHandler } from 'hono'
import { drain } from './logger.js'
import { appRouter } from './router.js'
import { exchangeCodeForTokens } from './services/lxns/index.js'
import { config } from './config.js'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { RequestHeadersPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'
import { onError } from '@orpc/server'
import { Sentry, shouldCaptureSentryError } from './lib/functions/sentry.js'
import { pool } from './db/index.js'
import { createDxdataHandler, createPostgresDxdataStore, DXDATA_CORS_OPTIONS, DXDATA_PATH } from './services/dxdata.js'
import { addPublishedDxdataToOpenApi } from './services/dxdata-openapi.js'
import { adminOpenAPIHandler, createAdminStandardErrorResponse } from './admin/handler.js'
import {
  recordAdminAuthorizationResultTo,
  reportAdminException,
  sanitizeAdminCorrelationId,
  type AdminAuthorizationResult,
} from './admin/observability.js'
import { createAdminAccessVerifier } from './admin/access-verifier.js'
import {
  createAdminAccessBoundaryMiddleware,
  isAdminAccessProtectedPath as isAdminApiPath,
} from './admin/access-boundary.js'
import { loadAdminRequestAuthentication } from './admin/principal-loader.js'
import { expireLegacyDomainAuthCookies } from './auth-security.js'
import { isAllowedExactOrigin } from './origin-policy.js'
import {
  ADMIN_CLIENT_INCOMPATIBLE_MESSAGE,
  ADMIN_CONTRACT_COMPATIBILITY_ID,
  ADMIN_CONTRACT_HEADER,
  AdminContractCompatibilityIdSchema,
} from '@gekichumai/admin-contract'

const app = new Hono<EvlogVariables>()
const adminAccessVerifier = createAdminAccessVerifier(config.admin.access)
const adminAccessBoundary = createAdminAccessBoundaryMiddleware(adminAccessVerifier)

const API_CATALOG_PROFILE_URL = 'https://www.rfc-editor.org/info/rfc9727'
const API_CATALOG_CONTENT_TYPE = `application/linkset+json; profile="${API_CATALOG_PROFILE_URL}"`
const ARCADE_VENUES_PATH = '/api/v1/arcades/venues'
const ARCADE_VENUES_BROWSER_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=60, stale-if-error=86400'
const ARCADE_VENUES_CDN_CACHE_CONTROL = 'public, max-age=21600, stale-while-revalidate=86400, stale-if-error=604800'
const ARCADE_VENUES_RETAINED_304_HEADERS = [
  ...RETAINED_304_HEADERS,
  'last-modified',
  'cdn-cache-control',
  'cloudflare-cdn-cache-control',
  'cache-tag',
  'access-control-allow-origin',
  'access-control-expose-headers',
]
const PUBLIC_STATIC_CATALOG_PATHS = new Set([ARCADE_VENUES_PATH, DXDATA_PATH])
const CREDENTIALED_ALLOW_HEADERS = ['Content-Type', 'Authorization', 'sentry-trace', 'baggage', 'x-captcha-response']
const ADMIN_ALLOW_HEADERS = [...CREDENTIALED_ALLOW_HEADERS, ADMIN_CONTRACT_HEADER]
const STANDARD_CREDENTIALED_METHODS = ['POST', 'GET', 'OPTIONS']
const ADMIN_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']

const isStateChangingMethod = (method: string): boolean => !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())

const setAdminPrivateNoStoreHeaders = (c: Context): void => {
  c.header('Cache-Control', 'private, no-store')
  c.header('CDN-Cache-Control', 'no-store')
  c.header('Cloudflare-CDN-Cache-Control', 'no-store')
}

const createExactCredentialedCors = ({
  origins,
  allowMethods,
  allowHeaders,
}: {
  origins: readonly string[]
  allowMethods: string[]
  allowHeaders: string[]
}): MiddlewareHandler => {
  const allowedOrigins = new Set(origins)
  const allowedCors = cors({
    origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
    allowHeaders,
    allowMethods,
    exposeHeaders: ['Content-Length', 'X-DXRating-Request-ID'],
    maxAge: 600,
    credentials: true,
  })

  return async (c, next) => {
    if (isAllowedExactOrigin(c.req.header('Origin'), allowedOrigins)) {
      return allowedCors(c, next)
    }

    // Credentialed Hono CORS otherwise emits Allow-Credentials even when its
    // origin callback rejects the origin. Do not invoke it for denied origins.
    if (c.req.method === 'OPTIONS') {
      c.header('Vary', 'Origin', { append: true })
      return c.body(null, 204)
    }
    await next()
    c.header('Vary', 'Origin', { append: true })
  }
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
          type: 'application/json',
        },
      ],
      'service-doc': [
        {
          href: `${origin}/docs`,
          type: 'text/html',
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
    `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"; profile="${API_CATALOG_PROFILE_URL}"`,
  )
}

// Error handler
app.onError((err, c) => {
  if (isAdminApiPath(c.req.path)) setAdminPrivateNoStoreHeaders(c)

  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined

  if (err instanceof z.ZodError) {
    return c.json({ error: 'Validation error', details: err.issues, requestId }, 400)
  }

  log?.error(err)
  Sentry.captureException(err, { tags: { requestId } })

  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  return c.json({ error: 'Internal server error', requestId }, 500)
})

const apiCors = createExactCredentialedCors({
  origins: config.browserTrustedOrigins,
  allowHeaders: CREDENTIALED_ALLOW_HEADERS,
  allowMethods: STANDARD_CREDENTIALED_METHODS,
})
const adminCors = createExactCredentialedCors({
  origins: config.admin.trustedOrigins,
  allowHeaders: ADMIN_ALLOW_HEADERS,
  allowMethods: ADMIN_METHODS,
})

const publicStaticCatalogCors = cors(DXDATA_CORS_OPTIONS)

// Administrator responses can contain credentials, personal data, deleted
// content, and internal reasons. This wrapper is deliberately registered
// before CORS so it also covers preflight responses returned by that layer.
app.use('*', async (c, next) => {
  if (!isAdminApiPath(c.req.path)) return next()

  try {
    await next()
  } finally {
    setAdminPrivateNoStoreHeaders(c)
  }
})

// Static catalog responses are credential-independent, allowing one public
// representation per URL to be safely shared by browsers and the CDN.
app.use('*', (c, next) => {
  if (PUBLIC_STATIC_CATALOG_PATHS.has(c.req.path)) return publicStaticCatalogCors(c, next)
  if (isAdminApiPath(c.req.path)) return adminCors(c, next)
  return apiCors(c, next)
})

// Access assertions are bearer credentials. Consume and remove both proof
// headers before evlog or any error-reporting middleware can inspect request
// headers. Public routes discard them; administrator requests validate the
// captured proof before compatibility, session, database, or procedure work.
app.use('*', adminAccessBoundary)

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

// Set X-DXRating-Request-ID response header
app.use('*', async (c, next) => {
  const log = c.get('log')
  const currentRequestId = (log?.getContext() as Record<string, unknown>)?.requestId
  const requestId =
    sanitizeAdminCorrelationId(typeof currentRequestId === 'string' ? currentRequestId : undefined) ??
    crypto.randomUUID()
  log?.set({ requestId })

  await next()

  if (requestId && !PUBLIC_STATIC_CATALOG_PATHS.has(c.req.path)) {
    c.header('X-DXRating-Request-ID', requestId)
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

// Build provenance endpoint
app.get('/version', async (c) => {
  const { getBuildInfo } = await import('./version.js')
  return c.json(await getBuildInfo())
})

// BetterAuth
app.on(['POST', 'GET'], '/api/auth/**', (c) => {
  return auth
    .handler(c.req.raw)
    .then((response) => expireLegacyDomainAuthCookies(response, config.auth.legacyCookieDomain))
})

// Middleware: validate auth params for fetch-net-records
const authParamsSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1),
  region: z.enum(['jp', 'intl']),
})

const verifyParams = createMiddleware(async (c, next) => {
  const body = await c.req.json()
  const region = c.req.param('region') ?? body.region

  const result = authParamsSchema.safeParse({ id: body.id, password: body.password, region })
  if (!result.success) {
    return c.json({ error: 'Invalid parameters', details: result.error.issues }, 400)
  }

  c.set('authParams', { id: result.data.id, password: result.data.password })
  c.set('region', result.data.region)
  return next()
})

// Sentry tunnel — accepts raw envelope body, proxies as-is
const SENTRY_ALLOWED_DSN_TARGETS = new Set([
  'o4506648698683392.ingest.sentry.io/4506648709627904',
  'o4506648698683392.ingest.us.sentry.io/4511398317064192',
])
const MAX_TUNNEL_BODY_SIZE = 20 * 1024 * 1024 // 20 MB

app.post('/api/v1/monitoring/tunnel', async (c) => {
  const contentLength = Number(c.req.header('content-length') ?? 0)
  if (contentLength > MAX_TUNNEL_BODY_SIZE) {
    return c.json({ error: 'Payload too large' }, 413)
  }

  const envelope = await c.req.text()
  if (Buffer.byteLength(envelope) > MAX_TUNNEL_BODY_SIZE) {
    return c.json({ error: 'Payload too large' }, 413)
  }

  try {
    const header = JSON.parse(envelope.split('\n')[0])
    const dsn = new URL(header.dsn)
    const projectId = dsn.pathname.replace('/', '')
    const sentryTarget = `${dsn.hostname}/${projectId}`

    if (!SENTRY_ALLOWED_DSN_TARGETS.has(sentryTarget)) {
      return c.json({ error: 'Invalid Sentry DSN' }, 400)
    }

    await fetch(`https://${dsn.hostname}/api/${projectId}/envelope/`, {
      method: 'POST',
      body: envelope,
    })
  } catch {
    // silently discard malformed envelopes
  }

  return c.body(null, 200)
})

// Functions
app.post('/functions/fetch-net-records/v0', verifyParams, fetchNetRecordsV0Handler)
app.post('/functions/fetch-net-records/v1/:region', verifyParams, fetchNetRecordsV1Handler)
app.post('/functions/render-oneshot/v0', oneshotRenderer)

// LXNS OAuth callback (direct Hono route — must be before oRPC catch-all since it redirects)
app.get('/api/v1/io/import/lxns/oauth_callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  const frontendCallback = `${config.frontendUrl}/io/import/lxns/oauth_callback`

  if (error || !code || !state) {
    const msg = error || 'missing_params'
    return c.redirect(`${frontendCallback}?status=error&error=${encodeURIComponent(msg)}`)
  }

  try {
    await exchangeCodeForTokens(code, state)
    return c.redirect(`${frontendCallback}?status=success`)
  } catch (err) {
    const log = c.get('log')
    log?.error(err instanceof Error ? err : new Error(String(err)))
    return c.redirect(`${frontendCallback}?status=error&error=exchange_failed`)
  }
})

// oRPC OpenAPI handler
const openAPIHandler = new OpenAPIHandler(appRouter, {
  plugins: [new RequestHeadersPlugin(), new ResponseHeadersPlugin()],
  clientInterceptors: [
    onError((error, { path }) => {
      if (!shouldCaptureSentryError(error)) return

      const procedureName = path.join('.')
      console.error(`[oRPC] ${procedureName} failed:`, error)
      Sentry.captureException(error, {
        tags: { 'orpc.procedure': procedureName },
      })
    }),
  ],
})

// oRPC OpenAPI generator for spec
const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

// The administrator contract has a physically separate handler and prefix. It
// is never composed into the public router or OpenAPI generator.
app.all('/api/admin/*', async (c) => {
  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined
  const receivedCompatibilityId = c.req.header(ADMIN_CONTRACT_HEADER)
  const procedureName = c.req.path === '/api/admin/bootstrap' ? 'bootstrap' : 'handler'
  const recordResult = (procedure: string, result: AdminAuthorizationResult): void => {
    recordAdminAuthorizationResultTo(procedure, result, {
      increment: (labels) => {
        log?.info('Administrator authorization result', {
          adminAuthorization: labels,
        })
      },
    })
  }

  if (receivedCompatibilityId !== ADMIN_CONTRACT_COMPATIBILITY_ID) {
    recordResult(procedureName, 'ADMIN_CLIENT_INCOMPATIBLE')
    const safeReceivedCompatibilityId = AdminContractCompatibilityIdSchema.safeParse(receivedCompatibilityId)
    return c.json(
      {
        defined: true,
        code: 'ADMIN_CLIENT_INCOMPATIBLE',
        status: 409,
        message: ADMIN_CLIENT_INCOMPATIBLE_MESSAGE,
        data: {
          requestId: requestId ?? null,
          expected: ADMIN_CONTRACT_COMPATIBILITY_ID,
          received: safeReceivedCompatibilityId.success ? safeReceivedCompatibilityId.data : null,
        },
      },
      409,
    )
  }

  if (isStateChangingMethod(c.req.method) && !config.admin.trustedOrigins.includes(c.req.header('Origin') ?? '')) {
    recordResult(procedureName, 'FORBIDDEN')
    return createAdminStandardErrorResponse('FORBIDDEN', requestId)
  }

  try {
    const authentication = await loadAdminRequestAuthentication(c.req.raw.headers)
    const { response } = await adminOpenAPIHandler.handle(c.req.raw, {
      prefix: '/api/admin',
      context: {
        authentication,
        requestId,
        recordAuthorizationResult: recordResult,
      },
    })
    if (!response) {
      recordResult(procedureName, 'NOT_FOUND')
      return createAdminStandardErrorResponse('NOT_FOUND', requestId)
    }
    return response
  } catch {
    reportAdminException('handler', requestId)
    recordResult(procedureName, 'INTERNAL_SERVER_ERROR')
    return createAdminStandardErrorResponse('INTERNAL_SERVER_ERROR', requestId)
  }
})

app.get('/robots.txt', (c) => c.text('User-agent: *\\nDisallow: /'))

const dxdataStore = createPostgresDxdataStore((text, values) => pool.query(text, values))
const dxdataHandler = createDxdataHandler<EvlogVariables>(dxdataStore, (error, c) => {
  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined
  log?.error(error instanceof Error ? error : new Error(String(error)))
  Sentry.captureException(error, { tags: { requestId } })
})

// The producer atomically advances the production publication pointer. Read
// its small metadata row first so HEAD and conditional requests never fetch
// the potentially large snapshot body.
app.on(['GET', 'HEAD'], DXDATA_PATH, dxdataHandler)

const arcadeVenuesCacheHeaders = createMiddleware(async (c, next) => {
  await next()
  if (c.res.status !== 200) return

  const result = await pool.query<{ last_modified: Date | null }>(`
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
  `)
  const lastModified = result.rows[0]?.last_modified
  if (lastModified) c.header('Last-Modified', lastModified.toUTCString())

  c.header('Cache-Control', ARCADE_VENUES_BROWSER_CACHE_CONTROL)
  c.header('CDN-Cache-Control', ARCADE_VENUES_CDN_CACHE_CONTROL)
  c.header('Cloudflare-CDN-Cache-Control', ARCADE_VENUES_CDN_CACHE_CONTROL)
  c.header('Cache-Tag', 'arcade-venues')
})

const stripWeakEtag = (value: string) => value.trim().replace(/^W\//, '')

const arcadeVenuesEtag = createMiddleware(async (c, next) => {
  const ifNoneMatch = c.req.header('If-None-Match')
  await next()

  // Validation errors and server errors are not stable catalog
  // representations and must never turn into conditional 304 responses.
  if (c.res.status !== 200) {
    c.res.headers.delete('ETag')
    return
  }

  const response = c.res
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer())
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
})

// This exact public route bypasses Better Auth's session lookup. Filtered
// compatibility requests still receive validators, while the CDN Cache Rule
// only marks the canonical query-less catalog eligible for edge storage.
app.get(ARCADE_VENUES_PATH, arcadeVenuesEtag, arcadeVenuesCacheHeaders, async (c) => {
  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined

  try {
    const request = c.req.method === 'HEAD' ? new Request(c.req.raw, { method: 'GET' }) : c.req.raw
    const { response } = await openAPIHandler.handle(request, {
      prefix: '/api/v1',
      context: {},
    })
    if (!response) return c.notFound()
    return response
  } catch (err) {
    log?.error(err instanceof Error ? err : new Error(String(err)))
    Sentry.captureException(err, { tags: { requestId } })
    return c.json({ error: 'Internal server error', requestId }, 500)
  }
})

app.all('/api/v1/*', async (c) => {
  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined

  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    const { response } = await openAPIHandler.handle(c.req.raw, {
      prefix: '/api/v1',
      context: { user: session?.user },
    })

    if (!response) return c.notFound()
    return response
  } catch (err) {
    log?.error(err instanceof Error ? err : new Error(String(err)))
    Sentry.captureException(err, { tags: { requestId } })
    return c.json({ error: 'Internal server error', requestId }, 500)
  }
})

app.get('/spec.json', async (c) => {
  const spec = await openAPIGenerator.generate(appRouter, {
    info: {
      title: 'DXRating API',
      version: '1.0.0',
      description:
        '> **Public Beta**: This API is in public beta and may not be finalized before the end of May 2026. Breaking changes are expected.\n\nOpenAPI for DXRating.net',
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
    filter: ({ contract }) => !contract['~orpc'].route.tags?.includes('internal'),
  })
  return c.json(addPublishedDxdataToOpenApi(spec))
})

// Serve Scalar API documentation
app.get('/docs', (c) => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>DXRating API</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>
        <div id="app"></div>
        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
        <script>
          Scalar.createApiReference('#app', {
            url: '/spec.json',
            authentication: {
              securitySchemes: {
                bearerAuth: {},
              },
            },
          })
        </script>
      </body>
    </html>
  `
  return c.html(html)
})

export { app }