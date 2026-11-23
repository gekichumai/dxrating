import {
  CLOUD_SAVE_NET_IMPORT_ROUTE,
  CORS_GROUP_PATHS,
  corsAllowsHeader,
  corsGroupFor,
  privateContractRoutes,
  publicContractRoutes,
  TRACE_HEADERS,
} from '@gekichumai/api-contract'
import { ProcedureContract, type AnyContractRouter } from '@orpc/contract'
import { getOpenAPIMeta } from '@orpc/openapi'
import { describe, expect, it } from 'vitest'
import { TRACE_PROPAGATION_TARGETS } from './trace-propagation'

// Sentry matches a string target as a substring and a RegExp with test()
const propagates = (url: string) =>
  TRACE_PROPAGATION_TARGETS.some((target) => (typeof target === 'string' ? url.includes(target) : target.test(url)))

type Request = { method: string; path: string }

const routes = (router: AnyContractRouter): Request[] => {
  if (!(router instanceof ProcedureContract)) return Object.values(router).flatMap((child) => routes(child))
  const { method = 'POST', path } = getOpenAPIMeta(router as never) ?? {}
  return [{ method, path: `/api/v1${path}`.replace(/\{[^}]+\}/g, 'x') }]
}

const apiRequests: Request[] = [
  ...routes({ ...publicContractRoutes, ...privateContractRoutes }),
  { method: CLOUD_SAVE_NET_IMPORT_ROUTE.method, path: CLOUD_SAVE_NET_IMPORT_ROUTE.path.replace('{id}', 'x') },
  ...Object.values(CORS_GROUP_PATHS).flatMap((paths) => paths.map((path) => ({ method: 'GET', path }))),
]

describe('TRACE_PROPAGATION_TARGETS', () => {
  it.each(['https://miruku.dxrating.net', 'http://localhost:3000'])(
    'adds trace headers to a request to %s only where its CORS preflight allows them',
    (origin) => {
      for (const { method, path } of apiRequests) {
        const allowed = TRACE_HEADERS.every((header) => corsAllowsHeader(corsGroupFor(path, method), header))
        for (const url of [`${origin}${path}`, `${origin}${path}?since=1`]) {
          expect(propagates(url), `${method} ${url}`).toBe(allowed)
        }
      }
    },
  )

  it('traces the rest of the API and this site', () => {
    for (const url of [
      'https://miruku.dxrating.net/api/v1/rpc/tags.list',
      'https://miruku.dxrating.net/api/v2/dxdataset',
      'https://dxrating.net/_serverFn/x',
      '/api/v1/x',
    ]) {
      expect(propagates(url), url).toBe(true)
    }
  })
})