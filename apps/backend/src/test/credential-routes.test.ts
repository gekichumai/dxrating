import { describe, expect, it } from 'vitest'
import { app } from '../app'
import { isCredentialPath } from '../lib/credential-hygiene'

/**
 * Direct Hono routes that take a request body without credentials in it. Every other direct route that takes a body
 * is a credential route (`DIRECT_CREDENTIAL_ROUTES` in `src/lib/credential-hygiene.ts`): #514 shipped the NET record
 * functions and Better Auth with their bodies reaching Sentry because nobody added them to a list.
 */
const DIRECT_ROUTES_WITHOUT_CREDENTIALS = new Set([
  // Sentry envelopes of the web client, which scrubs them before sending
  'POST /api/v1/monitoring/tunnel',
  // a chart image request: song and chart ids
  'POST /functions/render-oneshot/v0',
  // MCP JSON-RPC: catalog searches and rating calculations
  'POST /mcp',
  'DELETE /mcp',
])

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'ALL'])

/** `ALL` routes under these are middleware or the oRPC catch-all, whose credential routes come from the contract */
const isContractServed = (method: string, path: string) =>
  method === 'ALL' && (path === '/*' || path === '/api/v1' || path.startsWith('/api/v1/'))

/** A concrete path a route template matches: `/functions/fetch-net-records/v1/:region` → `.../v1/x` */
const samplePath = (template: string) => template.replace(/:[^/]+/g, 'x').replace(/\*+/g, 'x')

describe('direct routes and credentials', () => {
  it('classifies every direct route that takes a body', () => {
    const unclassified = app.routes
      .filter(({ method, path }) => BODY_METHODS.has(method) && !isContractServed(method, path))
      .map(({ method, path }) => `${method} ${path}`)
      .filter((route, index, routes) => routes.indexOf(route) === index)
      .filter((route) => {
        const path = route.slice(route.indexOf(' ') + 1)
        return !isCredentialPath(samplePath(path)) && !DIRECT_ROUTES_WITHOUT_CREDENTIALS.has(route)
      })
    expect(
      unclassified,
      'Add each route to DIRECT_CREDENTIAL_ROUTES in src/lib/credential-hygiene.ts if its request can carry a ' +
        'credential (a SEGA ID or password, a token, an OAuth code), or to DIRECT_ROUTES_WITHOUT_CREDENTIALS here',
    ).toEqual([])
  })

  it('lists only routes that exist and are not credential routes', () => {
    const routes = new Set(app.routes.map(({ method, path }) => `${method} ${path}`))
    for (const route of DIRECT_ROUTES_WITHOUT_CREDENTIALS) {
      expect(routes.has(route), route).toBe(true)
      expect(isCredentialPath(samplePath(route.slice(route.indexOf(' ') + 1))), route).toBe(false)
    }
  })
})