import * as Sentry from '@sentry/node'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createMiddleware } from 'hono/factory'
import { cors } from 'hono/cors'
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

const app = new Hono<EvlogVariables>()

// Error handler
app.onError((err, c) => {
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

// CORS
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow local development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return origin
      }

      // Allow production domain and Cloudflare Pages previews
      if (origin === 'https://dxrating.net' || origin.endsWith('.dxrating.pages.dev')) {
        return origin
      }

      return null
    },
    allowHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'baggage', 'x-captcha-response'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'X-DXRating-Request-ID'],
    maxAge: 600,
    credentials: true,
  }),
)

// Request logging
app.use(
  '*',
  evlog({
    drain,
    exclude: ['/health', '/version', '/robots.txt', '/docs', '/spec.json', '/', '/api/v1/monitoring/tunnel'],
  }) as unknown as MiddlewareHandler,
)

// Set X-DXRating-Request-ID response header
app.use('*', async (c, next) => {
  await next()
  const log = c.get('log')
  const requestId = (log?.getContext() as Record<string, unknown>)?.requestId as string | undefined
  if (requestId) {
    c.header('X-DXRating-Request-ID', requestId)
  }
})

// Root redirect to docs
app.get('/', (c) => c.redirect('/docs'))

// Health endpoint
app.get('/health', (c) => c.json({ status: 'ok' }))

// Build provenance endpoint
app.get('/version', async (c) => {
  const { getBuildInfo } = await import('./version.js')
  return c.json(await getBuildInfo())
})

// BetterAuth
app.on(['POST', 'GET'], '/api/auth/**', (c) => {
  return auth.handler(c.req.raw)
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
const SENTRY_HOST = 'o4506648698683392.ingest.sentry.io'
const SENTRY_PROJECT_IDS = ['4506648709627904']
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

    if (dsn.hostname !== SENTRY_HOST || !SENTRY_PROJECT_IDS.includes(projectId)) {
      return c.json({ error: 'Invalid Sentry DSN' }, 400)
    }

    await fetch(`https://${SENTRY_HOST}/api/${projectId}/envelope/`, {
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

app.get('/robots.txt', (c) => c.text('User-agent: *\\nDisallow: /'))

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
  return c.json(spec)
})

// Serve Scalar API documentation
app.get('/docs', (c) => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>DXRating API</title>
        <meta charset="utf-8" />
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