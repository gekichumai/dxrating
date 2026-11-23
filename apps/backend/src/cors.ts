import { CORS_POLICIES, corsGroupFor, type CorsGroup } from '@gekichumai/api-contract'
import type { Context, MiddlewareHandler } from 'hono'
import { cors as honoCors } from 'hono/cors'

const policies: Record<CorsGroup, MiddlewareHandler> = {
  api: honoCors(CORS_POLICIES.api),
  publicList: honoCors(CORS_POLICIES.publicList),
  catalog: honoCors(CORS_POLICIES.catalog),
  mcp: honoCors(CORS_POLICIES.mcp),
}

const routedMethod = (c: Context) =>
  c.req.method === 'OPTIONS' ? (c.req.header('Access-Control-Request-Method')?.toUpperCase() ?? 'GET') : c.req.method

export const cors: MiddlewareHandler = (c, next) => policies[corsGroupFor(c.req.path, routedMethod(c))](c, next)