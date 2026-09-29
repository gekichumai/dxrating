import { getCommonErrorStatus } from './lib/functions/sentry'
import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createMiddleware } from 'hono/factory'
import { cors } from 'hono/cors'
import { RETAINED_304_HEADERS } from 'hono/etag'
import { z } from 'zod'
import { Authentication } from './auth'
import { Data, Effect, Option } from 'effect'
import { HttpBody } from 'effect/http'
import { appRuntime, runApp, superviseApp } from './runtime'
import { HttpClient } from './services/http-client'
import { getBuildInfo } from './version'
import { handler as oneshotRenderer } from './services/functions/oneshot-renderer/index'
import {
  v0Handler as fetchNetRecordsV0Handler,
  v1Handler as fetchNetRecordsV1Handler,
} from './services/functions/fetch-net-records/index'
import { evlog, type EvlogVariables } from 'evlog/hono'
import { drain } from './logger'
import { appRouter, type ApiContext } from './router'
import { exchangeCodeForTokens } from './services/lxns/index'
import { AppConfig } from './config'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { getOpenAPIMeta, OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { RequestHeadersHandlerPlugin, ResponseHeadersHandlerPlugin } from '@orpc/server/plugins'
import { onError } from '@orpc/server'
import { Sentry, shouldCaptureSentryError } from './lib/functions/sentry'
import { Database } from './db/index'
import { createDxdataEffect, createPostgresDxdataEffects, DXDATA_CORS_OPTIONS, DXDATA_PATH } from './services/dxdata'
import { addPublishedDxdataToOpenApi } from './services/dxdata-openapi'
import { addPublicApiExamplesToOpenApi } from './services/openapi-examples'
class HttpAdapterError extends Data.TaggedError('HttpAdapterError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

const app = new Hono<EvlogVariables>()

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

const getFirstHeaderValue = (value: string | undefined) => {
  const first = value?.split(',')[0]?.trim()
  return first === '' ? undefined : first
}

const getValidProtocol = (value: string | undefined) => {
  const protocol = value?.toLowerCase()
  return protocol === 'http' || protocol === 'https' ? protocol : undefined
}

const isValidHost = (host: string | undefined) => {
  if (host === undefined || host === null || host === '' || /[\s/@\\]/.test(host)) return false

  try {
    const url = new URL(`https://${host}`)
    return url.hostname.length > 0 && url.pathname === '/' && url.search === '' && url.hash === ''
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

// Error handler
app.onError((err, c) => {
  const log = c.get('log')
  const contextRequestId: unknown = log?.getContext().requestId
  const requestId = typeof contextRequestId === 'string' ? contextRequestId : undefined

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
  allowHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'baggage', 'x-captcha-response'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'X-DXRating-Request-ID'],
  maxAge: 600,
  credentials: true,
})

const publicStaticCatalogCors = cors(DXDATA_CORS_OPTIONS)

// Static catalog responses are credential-independent, allowing one public
// representation per URL to be safely shared by browsers and the CDN.
app.use('*', (c, next) =>
  PUBLIC_STATIC_CATALOG_PATHS.has(c.req.path) ? publicStaticCatalogCors(c, next) : apiCors(c, next),
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
  }),
)

// Set X-DXRating-Request-ID response header
app.use('*', (c, next) =>
  runApp(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run HTTP middleware', cause }),
      })
      const log = c.get('log')
      const contextRequestId: unknown = log?.getContext().requestId
      const requestId = typeof contextRequestId === 'string' ? contextRequestId : undefined
      if (
        requestId !== undefined &&
        requestId !== null &&
        requestId !== '' &&
        !PUBLIC_STATIC_CATALOG_PATHS.has(c.req.path)
      ) {
        c.header('X-DXRating-Request-ID', requestId)
      }
    }),
    { signal: c.req.raw.signal },
  ),
)

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
      const body = yield* Effect.tryPromise({
        try: () => c.req.json(),
        catch: (cause) => new HttpAdapterError({ operation: 'Read NET parameters', cause }),
      })
      const region = c.req.param('region') ?? body.region

      const result = authParamsSchema.safeParse({ id: body.id, password: body.password, region })
      if (!result.success) {
        return c.json({ error: 'Invalid parameters', details: result.error.issues }, 400)
      }

      c.set('authParams', { id: result.data.id, password: result.data.password })
      c.set('region', result.data.region)
      return yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run NET handler', cause }),
      })
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
app.post('/functions/render-oneshot/v0', oneshotRenderer)

// LXNS OAuth callback (direct Hono route — must be before oRPC catch-all since it redirects)
app.get('/api/v1/io/import/lxns/oauth_callback', (c) =>
  runApp(
    Effect.gen(function* () {
      const code = c.req.query('code')
      const state = c.req.query('state')
      const error = c.req.query('error')
      const config = yield* AppConfig
      const frontendCallback = `${config.frontendUrl}/io/import/lxns/oauth_callback`
      if (
        (error !== undefined && error !== null && error !== '') ||
        code === undefined ||
        code === null ||
        code === '' ||
        state === undefined ||
        state === null ||
        state === ''
      ) {
        return c.redirect(
          `${frontendCallback}?status=error&error=${encodeURIComponent(error === undefined || error === '' ? 'missing_params' : error)}`,
        )
      }
      return yield* exchangeCodeForTokens(code, state).pipe(
        Effect.map(() => c.redirect(`${frontendCallback}?status=success`)),
        Effect.catch((error) =>
          Effect.sync(() => {
            c.get('log')?.error(error)
            return c.redirect(`${frontendCallback}?status=error&error=exchange_failed`)
          }),
        ),
      )
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
    status: getCommonErrorStatus(error.code),
  }),
  plugins: [new RequestHeadersHandlerPlugin<ApiContext>(), new ResponseHeadersHandlerPlugin<ApiContext>()],
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
  converters: [new ZodToJsonSchemaConverter()],
})

app.get('/robots.txt', (c) => c.text('User-agent: *\\nDisallow: /'))

const dxdataStore = createPostgresDxdataEffects((text, values) =>
  Effect.flatMap(Database, (database) => database.raw('Read published catalog', text, values)),
)
const dxdataHandler = createDxdataEffect(dxdataStore, (error, c: Context<EvlogVariables>) => {
  const log = c.get('log')
  const contextRequestId: unknown = log?.getContext().requestId
  const requestId = typeof contextRequestId === 'string' ? contextRequestId : undefined
  log?.error(error instanceof Error ? error : new Error(String(error)))
  Sentry.captureException(error, { tags: { requestId } })
})

// The producer atomically advances the production publication pointer. Read
// its small metadata row first so HEAD and conditional requests never fetch
// the potentially large snapshot body.
app.on(['GET', 'HEAD'], DXDATA_PATH, (c) => runApp(dxdataHandler(c), { signal: c.req.raw.signal }))

const arcadeVenuesCacheHeaders = createMiddleware((c, next) =>
  runApp(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run arcade handler', cause }),
      })
      if (c.res.status !== 200) return

      const database = yield* Database
      const result = yield* database.raw(
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
      if (lastModified instanceof Date) c.header('Last-Modified', lastModified.toUTCString())

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
  const log = c.get('log')
  const contextRequestId: unknown = log?.getContext().requestId
  const requestId = typeof contextRequestId === 'string' ? contextRequestId : undefined
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
        response !== undefined && response !== null
          ? Effect.succeed(response)
          : Effect.promise(() => Promise.resolve(c.notFound())),
      ),
      Effect.catch((error) => Effect.sync(() => reportApiError(c, error.cause))),
    ),
    { signal: c.req.raw.signal },
  ),
)

// Comment responses depend on the signed-in viewer and must never enter a shared cache.
app.use('/api/v1/comments', (c, next) =>
  runApp(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: next,
        catch: (cause) => new HttpAdapterError({ operation: 'Run comments handler', cause }),
      })
      c.header('Cache-Control', 'private, no-store')
      c.header('CDN-Cache-Control', 'no-store')
      c.header('Cloudflare-CDN-Cache-Control', 'no-store')
      c.header('Vary', 'Cookie, Authorization, Origin')
    }),
    { signal: c.req.raw.signal },
  ),
)

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
            },
            filter: (contract) => getOpenAPIMeta(contract)?.tags?.includes('internal') !== true,
          }),
        catch: (cause) => new HttpAdapterError({ operation: 'Generate OpenAPI specification', cause }),
      })
      return c.json(addPublicApiExamplesToOpenApi(addPublishedDxdataToOpenApi(spec)))
    }),
    { signal: c.req.raw.signal },
  ),
)

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