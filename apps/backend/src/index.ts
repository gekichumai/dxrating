import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { auth } from './auth'
import { appRouter } from './router'
import { z } from 'zod'

const app = new Hono()

// CORS
app.use(
  '*',
  cors({
    origin: (origin) => {
      return origin // Allow all origins for dev simplicity, or check strict list
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

// oRPC
import { RPCHandler } from '@orpc/server/fetch'

const orpcHandler = new RPCHandler(appRouter)

// Mount oRPC
app.use('/api/*', async (c) => {
  // Need to pass prefix if router is mounted at subpath?
  // Using standard handle
  const res = await orpcHandler.handle(c.req.raw, {
    context: async () => {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      })
      return {
        user: session?.user,
      }
    },
  })
  return res
})

// OpenAPI
import { OpenAPIGenerator } from '@orpc/openapi'
import { appContract } from './contract'

const openAPIGenerator = new OpenAPIGenerator()

const openAPISpec = openAPIGenerator.generate(appContract)

app.get('/doc/openapi.json', (c) => {
  return c.json(openAPISpec)
})

import { config } from './config'

// ... imports ...

const port = config.port
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
