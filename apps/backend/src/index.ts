import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { auth } from './auth'
import { OpenAPIGenerator } from '@orpc/openapi'
import { appContract } from './contract'

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
