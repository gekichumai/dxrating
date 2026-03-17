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
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { RequestHeadersPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'

const app = new Hono<EvlogVariables>()

// Error handler
app.onError((err, c) => {
  if (err instanceof z.ZodError) {
    return c.json({ error: 'Validation error', details: err.issues }, 400)
  }
  c.get('log')?.error(err)
  Sentry.captureException(err)
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  return c.json({ error: 'Internal server error' }, 500)
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

      // Allow production domain
      if (origin === 'https://dxrating.net') {
        return origin
      }

      return null
    },
    allowHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'baggage'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  }),
)

// Request logging
app.use(
  '*',
  evlog({
    drain,
    exclude: ['/health', '/robots.txt', '/docs', '/spec.json', '/'],
  }) as unknown as MiddlewareHandler,
)

// Root redirect to docs
app.get('/', (c) => c.redirect('/docs'))

// Health endpoint
app.get('/health', (c) => c.json({ status: 'ok' }))

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

// oRPC OpenAPI handler
const openAPIHandler = new OpenAPIHandler(appRouter, {
  plugins: [new RequestHeadersPlugin(), new ResponseHeadersPlugin()],
})

// oRPC OpenAPI generator for spec
const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

app.get('/robots.txt', (c) => c.text('User-agent: *\\nDisallow: /'))

app.all('/api/v1/*', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  const { response } = await openAPIHandler.handle(c.req.raw, {
    prefix: '/api/v1',
    context: { user: session?.user },
  })

  return response ?? c.notFound()
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