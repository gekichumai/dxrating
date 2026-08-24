import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { cors } from 'hono/cors'
import { RETAINED_304_HEADERS } from 'hono/etag'
import { z } from 'zod'
import { auth } from './auth.js'
import {
  ACCOUNT_BANNED_CODE,
  createPrivateAuthOperationFailedResponse,
  getProjectedAuthBanDenial,
  getProvenAuthBanUserId,
  projectAccountBannedResponse,
  runWithAuthBanRequestState,
  type AccountBannedResponse,
} from './auth-ban-enforcement.js'
import { handler as oneshotRenderer } from './services/functions/oneshot-renderer/index.js'
import {
  v0Handler as fetchNetRecordsV0Handler,
  v1Handler as fetchNetRecordsV1Handler,
} from './services/functions/fetch-net-records/index.js'
import { evlog } from 'evlog/hono'
import type { MiddlewareHandler } from 'hono'
import { drain } from './logger.js'
import { appRouter } from './router.js'
import { exchangeCodeForTokens } from './services/lxns/index.js'
import { PublicAccountBanned } from './public-access-policy.js'
import { config } from './config.js'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { RequestHeadersPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'
import { onError } from '@orpc/server'
import { Sentry, shouldCaptureSentryError } from './lib/functions/sentry.js'
import { pool } from './db/index.js'
import { loadPostgresUserBanState } from './admin/user-ban-store.js'
import { createDxdataHandler, createPostgresDxdataStore, DXDATA_CORS_OPTIONS, DXDATA_PATH } from './services/dxdata.js'
import { addPublishedDxdataToOpenApi } from './services/dxdata-openapi.js'
import { adminOpenAPIHandler, createAdminStandardErrorResponse } from './admin/handler.js'
import {
  recordAdminAuthorizationResult,
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
import { adminPrimaryAuthService } from './admin/primary-auth-runtime.js'
import { runPostgresAdminWriteLease } from './admin/write-lease.js'
import { ADMIN_GENERIC_REQUEST_LOG_EXCLUSIONS } from './admin/request-logging-policy.js'
import { createRequestErrorHandler } from './request-error-handler.js'
import type { AppEnvironment } from './request-context.js'
import { expireLegacyDomainAuthCookies } from './auth-security.js'
import { isAllowedExactOrigin } from './origin-policy.js'
import {
  ADMIN_CLIENT_INCOMPATIBLE_MESSAGE,
  ADMIN_CONTRACT_COMPATIBILITY_ID,
  ADMIN_CONTRACT_HEADER,
  AdminContractCompatibilityIdSchema,
  AdminPrimaryAuthProviderSchema,
} from '@gekichumai/admin-contract'

const app = new Hono<AppEnvironment>()
const adminAccessVerifier = createAdminAccessVerifier(config.admin.access)
const adminAccessBoundary = createAdminAccessBoundaryMiddleware(adminAccessVerifier)

const API_CATALOG_PROFILE_URL = 'https://www.rfc-editor.org/info/rfc9727'
const API_CATALOG_CONTENT_TYPE = `application/linkset+json; profile="${API_CATALOG_PROFILE_URL}"`
const PUBLIC_COMMENTS_PATH = '/api/v1/comments'
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
  c.header('Referrer-Policy', 'no-referrer')
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
    exposeHeaders: ['Content-Length', 'X-DXRating-Request-ID', 'Retry-After'],
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
app.onError(
  createRequestErrorHandler({
    reportAdminException,
    captureException: (error, requestId) => Sentry.captureException(error, { tags: { requestId } }),
  }),
)

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

const accountBannedAuthResponse = (
  denial: AccountBannedResponse | Pick<AccountBannedResponse, 'code' | 'message'>,
): Response =>
  new Response(JSON.stringify(denial), {
    status: 403,
    headers: {
      'Cache-Control': 'private, no-store',
      'CDN-Cache-Control': 'no-store',
      'Cloudflare-CDN-Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'Referrer-Policy': 'no-referrer',
    },
  })

const protectPublicAccountBanResponse = async (response: Response): Promise<Response> => {
  if (response.status !== 403) return response

  let body: unknown
  try {
    body = await response.clone().json()
  } catch {
    return response
  }
  if (!body || typeof body !== 'object' || Reflect.get(body, 'code') !== ACCOUNT_BANNED_CODE) return response

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('CDN-Cache-Control', 'no-store')
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const isActiveBanDatabaseGuardError = (error: unknown): boolean =>
  error !== null &&
  typeof error === 'object' &&
  Reflect.get(error, 'code') === 'DXB01' &&
  Reflect.get(error, 'constraint') === 'active_user_ban_write_guard'

const handleBetterAuthWithBanPolicy = async (request: Request, path: string): Promise<Response> =>
  runWithAuthBanRequestState(async () => {
    let response: Response | undefined
    let databaseGuardFailure = false
    try {
      response = await auth.handler(request)
    } catch (error) {
      if (!isActiveBanDatabaseGuardError(error)) throw error
      databaseGuardFailure = true
    }

    let denial = await getProjectedAuthBanDenial()
    if (!denial && (databaseGuardFailure || (response?.status ?? 0) >= 500)) {
      const provenUserId = await getProvenAuthBanUserId()
      if (provenUserId) {
        const state = await loadPostgresUserBanState(pool, provenUserId)
        if (state.active) denial = projectAccountBannedResponse(state)
      }
    }

    if (denial) {
      Sentry.metrics.count('auth.account_banned', 1, {
        attributes: {
          code: ACCOUNT_BANNED_CODE,
          flow: path.startsWith('/api/auth/callback/') ? 'oauth' : 'direct',
          temporary: denial.expiresAt === null ? 'false' : 'true',
        },
      })
      return accountBannedAuthResponse(denial)
    }

    // A dedicated database denial without a surviving proof identity remains
    // a generic fail-closed response. Never infer an account from untrusted
    // request fields merely to reveal moderation state.
    if (databaseGuardFailure) {
      return createPrivateAuthOperationFailedResponse()
    }
    return response!
  })

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

// Generic request logging is deliberately disabled for administrator paths,
// so correlation state must not depend on evlog's request-local logger. Place
// this before the server-only callback as well as the administrator handler.
app.use('*', async (c, next) => {
  if (!isAdminApiPath(c.req.path)) return next()

  const requestId = sanitizeAdminCorrelationId(c.req.header('x-request-id')) ?? crypto.randomUUID()
  c.set('requestId', requestId)

  await next()

  c.header('X-DXRating-Request-ID', requestId)
})

// OAuth authorization codes and state terminate on this server-only callback.
// Keep it before evlog so callback query values cannot enter access logs,
// breadcrumbs, or frontend telemetry. The correlation middleware above sees
// only the path and headers; Cloudflare Access, private no-store headers, and
// the current Better Auth session still apply.
app.get('/api/admin/primary-auth/oauth/callback/:provider', async (c) => {
  const resultUrl = new URL('/primary-auth/result', config.admin.frontendOrigin)
  const fail = () => {
    resultUrl.searchParams.set('status', 'failure')
    return c.redirect(resultUrl.toString())
  }

  try {
    const provider = AdminPrimaryAuthProviderSchema.safeParse(c.req.param('provider'))
    if (!provider.success) return fail()

    const authentication = await loadAdminRequestAuthentication(c.req.raw.headers)
    if (authentication.status !== 'authenticated' || !authentication.principal) return fail()

    const actor = {
      userId: authentication.authorizationUser.id,
      sessionId: authentication.session.id,
    }
    await runPostgresAdminWriteLease(actor, () =>
      adminPrimaryAuthService.completeOauth(
        actor,
        provider.data,
        c.req.query('state') ?? null,
        c.req.query('error') ? null : (c.req.query('code') ?? null),
      ),
    )
    resultUrl.searchParams.set('status', 'success')
    return c.redirect(resultUrl.toString())
  } catch {
    return fail()
  }
})

// LXNS authorization codes and one-time states are credentials as well. Keep
// this callback before evlog so its query string cannot enter access logs or
// breadcrumbs. Ban denials use only a stable redirect code; never a reason or
// account identifier.
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
    if (err instanceof PublicAccountBanned) {
      Sentry.metrics.count('public_api.access_denied', 1, {
        attributes: {
          access: 'authenticated_write',
          code: 'ACCOUNT_BANNED',
          procedure: 'lxns.oauth_callback',
        },
      })
      return c.redirect(`${frontendCallback}?status=error&error=account_banned`)
    }
    Sentry.metrics.count('lxns.oauth_callback_failed', 1, {
      attributes: { result: 'exchange_failed' },
    })
    return c.redirect(`${frontendCallback}?status=error&error=exchange_failed`)
  }
})

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
      ...ADMIN_GENERIC_REQUEST_LOG_EXCLUSIONS,
    ],
  }) as unknown as MiddlewareHandler,
)

// Set X-DXRating-Request-ID response header
app.use('*', async (c, next) => {
  if (isAdminApiPath(c.req.path)) return next()

  const log = c.get('log')
  const currentRequestId = (log?.getContext() as Record<string, unknown>)?.requestId
  const requestId =
    sanitizeAdminCorrelationId(typeof currentRequestId === 'string' ? currentRequestId : undefined) ??
    crypto.randomUUID()
  c.set('requestId', requestId)
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
  return handleBetterAuthWithBanPolicy(c.req.raw, c.req.path).then((response) =>
    expireLegacyDomainAuthCookies(response, config.auth.legacyCookieDomain),
  )
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

  const result = authParamsSchema.safeParse({
    id: body.id,
    password: body.password,
    region,
  })
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
  const requestId = c.get('requestId')
  const receivedCompatibilityId = c.req.header(ADMIN_CONTRACT_HEADER)
  const procedureName = c.req.path === '/api/admin/bootstrap' ? 'bootstrap' : 'handler'
  const recordResult = (procedure: string, result: AdminAuthorizationResult): void => {
    try {
      recordAdminAuthorizationResult(procedure, result)
    } catch {
      // Telemetry must never change an administrator response.
    }
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
        requestOrigin: config.admin.trustedOrigins.includes(c.req.header('Origin') ?? '')
          ? c.req.header('Origin')
          : undefined,
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
const dxdataHandler = createDxdataHandler<AppEnvironment>(dxdataStore, (error, c) => {
  const log = c.get('log')
  const requestId = c.get('requestId')
  log?.error(error instanceof Error ? error : new Error(String(error)))
  Sentry.captureException(error, { tags: { requestId } })
})

// The producer atomically advances the production publication pointer. Read
// its small metadata row first so HEAD and conditional requests never fetch
// the potentially large snapshot body.
app.on(['GET', 'HEAD'], DXDATA_PATH, dxdataHandler)

// Comment moderation state changes immediately, and a cached pre-deletion
// response would retain text that is no longer public. Comments therefore
// bypass browser, shared-CDN, and Cloudflare storage entirely; every list
// request observes the current database projection.
app.use(PUBLIC_COMMENTS_PATH, async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('CDN-Cache-Control', 'no-store')
  c.header('Cloudflare-CDN-Cache-Control', 'no-store')
})

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
  c.res = new Response(null, {
    status: 304,
    statusText: 'Not Modified',
    headers,
  })
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
    const { response } = await openAPIHandler.handle(c.req.raw, {
      prefix: '/api/v1',
      // Procedure metadata decides whether identity is relevant. Public reads
      // never inspect a cookie, while authenticated reads and writes resolve a
      // fresh session and the current database-time ban state centrally.
      context: { headers: c.req.raw.headers },
    })

    if (!response) return c.notFound()
    return protectPublicAccountBanResponse(response)
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