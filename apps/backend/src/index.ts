import { initSentry } from './lib/functions/sentry'
initSentry()

import { serve as nodeServe } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { auth } from './auth'

import { config } from './config'

const app = new Hono()

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

      // Allow Capacitor apps
      if (origin.startsWith('capacitor://')) {
        return origin
      }

      // Block other origins by not returning them (or handle as needed)
      // For now, consistent with "return origin" usually meaning "allow",
      // returning undefined/null typically blocks in some middleware,
      // but Hono cors "origin" option expects string | (origin: string) => string | undefined | null
      return null
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  }),
)

// BetterAuth
app.on(['POST', 'GET'], '/api/auth/**', (c) => {
  return auth.handler(c.req.raw)
})

// Functions
import { handler as oneshotRenderer } from './services/functions/oneshot-renderer/index'
app.post('/functions/render-oneshot/v0', oneshotRenderer)

// oRPC
import { appRouter } from './router'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { RequestHeadersPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'

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
      description: 'OpenAPI for DXRating.net',
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

const port = config.port
console.log(`Server is running on port ${port}`)

nodeServe({
  fetch: app.fetch,
  port,
})
