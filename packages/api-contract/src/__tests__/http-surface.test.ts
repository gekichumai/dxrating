import { ProcedureContract, type AnyContractRouter } from '@orpc/contract'
import { getOpenAPIMeta } from '@orpc/openapi'
import { describe, expect, it } from 'vitest'
import { publicContractRoutes } from '../contract.ts'
import {
  CAPTCHA_RESPONSE_HEADER,
  CORS_GROUP_PATHS,
  CORS_POLICIES,
  corsAllowsHeader,
  corsGroupFor,
} from '../http-surface.ts'
import { CLOUD_SAVE_EXPECTED_USER_HEADER, CLOUD_SAVE_NET_IMPORT_ROUTE } from '../private/cloud-save.ts'
import { privateContractRoutes } from '../private/index.ts'

type Route = { method: string; path: string }

const routes = (router: AnyContractRouter): Route[] => {
  if (!(router instanceof ProcedureContract)) return Object.values(router).flatMap((child) => routes(child))
  const { method = 'POST', path } = getOpenAPIMeta(router as never) ?? {}
  return [{ method, path: `/api/v1${path}`.replace(/\{[^}]+\}/g, 'x') }]
}

const netImport: Route = { ...CLOUD_SAVE_NET_IMPORT_ROUTE, path: CLOUD_SAVE_NET_IMPORT_ROUTE.path.replace('{id}', 'x') }
const privateRoutes = [...routes(privateContractRoutes), netImport]
const allRoutes = [...routes(publicContractRoutes), ...privateRoutes]

const preflightPasses = ({ method, path }: Route, headers: string[] = []) => {
  const group = corsGroupFor(path, method)
  return (
    CORS_POLICIES[group].allowMethods.includes(method) && headers.every((header) => corsAllowsHeader(group, header))
  )
}

describe('the HTTP surface', () => {
  it('lets a browser call every route with its method', () => {
    expect(allRoutes.length).toBeGreaterThan(30)
    for (const route of allRoutes) expect(preflightPasses(route), `${route.method} ${route.path}`).toBe(true)
  })

  it('accepts the account header the web sends with every private route', () => {
    for (const route of privateRoutes) {
      expect(preflightPasses(route, [CLOUD_SAVE_EXPECTED_USER_HEADER]), `${route.method} ${route.path}`).toBe(true)
    }
  })

  it('accepts the Turnstile token of a sign-in and a sign-up', () => {
    for (const path of ['/api/auth/sign-in/email', '/api/auth/sign-up/email']) {
      expect(preflightPasses({ method: 'POST', path }, [CAPTCHA_RESPONSE_HEADER]), path).toBe(true)
    }
  })

  it('accepts the revalidation of every catalog and public list', () => {
    for (const path of [...CORS_GROUP_PATHS.catalog, ...CORS_GROUP_PATHS.publicList]) {
      expect(preflightPasses({ method: 'GET', path }, ['If-None-Match']), path).toBe(true)
    }
  })

  it('refuses a method no route has', () => {
    expect(preflightPasses({ method: 'PUT', path: '/api/v1/saves/x' })).toBe(false)
  })
})