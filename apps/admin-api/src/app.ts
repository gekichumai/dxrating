import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIGenerator } from '@orpc/openapi'
import { RequestHeadersHandlerPlugin } from '@orpc/server/plugins'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import type { ManagedRuntime } from 'effect'
import { Effect } from 'effect'
import { Hono } from 'hono'
import { adminApiContract } from './contract'
import { requireAdmin } from './require-admin'
import { adminApiRouter, type AdminApiContext } from './router'
import type { AdminApiServices } from './runtime'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** The admin API app: `/api/*` (oRPC over OpenAPI), the private `/api/spec.json` and `/health`. */
export const createAdminApiApp = (runtime: ManagedRuntime.ManagedRuntime<AdminApiServices, never>) => {
  const handler = new OpenAPIHandler(adminApiRouter, {
    plugins: [new RequestHeadersHandlerPlugin<AdminApiContext>()],
  })
  const generator = new OpenAPIGenerator({ converters: [new ZodToJsonSchemaConverter()] })
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))

  // Private: behind Access like everything on this host, and only for an admin principal
  app.get('/api/spec.json', async (c) => {
    const allowed = await runtime.runPromise(
      requireAdmin(c.req.raw.headers).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      ),
    )
    if (!allowed) return c.json({ message: 'Forbidden' }, 403, NO_STORE)
    const spec = await generator.generate(adminApiContract, {
      base: { info: { title: 'DXRating Admin API', version: '0.1.0' }, servers: [{ url: '/api' }] },
    })
    return c.json(spec, 200, NO_STORE)
  })

  app.all('/api/*', async (c) => {
    const effectContext = await runtime.runPromise(runtime.contextEffect)
    const { response } = await handler.handle(c.req.raw, {
      prefix: '/api',
      context: { 'effect/context': effectContext },
    })
    if (!response) return c.notFound()
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'private, no-store')
    return new Response(response.body, { status: response.status, headers })
  })

  return app
}