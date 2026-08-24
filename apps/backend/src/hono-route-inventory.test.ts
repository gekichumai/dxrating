import { describe, expect, it } from 'vitest'
import { app } from './app.js'
import { HONO_ROUTE_ACCESS_POLICIES } from './hono-route-inventory.js'

const routeKey = ({ method, path }: { readonly method: string; readonly path: string }) => `${method} ${path}`

describe('direct Hono route active-ban inventory', () => {
  it('requires every directly registered route namespace to have an explicit access policy', () => {
    const actual = Array.from(
      new Set(
        app.routes
          // Global middleware has no route semantics of its own.
          .filter((route) => !(route.method === 'ALL' && route.path === '/*'))
          .map(routeKey),
      ),
    ).sort()
    const classified = HONO_ROUTE_ACCESS_POLICIES.map(routeKey).sort()

    expect(actual).toEqual(classified)
    expect(new Set(classified).size).toBe(classified.length)
  })

  it('keeps the identity-bound direct routes out of method-based inference', () => {
    expect(
      HONO_ROUTE_ACCESS_POLICIES.filter(({ access }) =>
        ['admin_authenticated_write', 'verified_identity_write'].includes(access),
      ),
    ).toEqual([
      {
        method: 'GET',
        path: '/api/admin/primary-auth/oauth/callback/:provider',
        access: 'admin_authenticated_write',
      },
      {
        method: 'GET',
        path: '/api/v1/io/import/lxns/oauth_callback',
        access: 'verified_identity_write',
      },
    ])
  })
})