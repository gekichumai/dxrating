import { HttpClientLive } from '@gekichumai/backend/http-client'
import { Layer } from 'effect'
import pg from 'pg'
import { accessVerifierTestLayer } from '../access'
import { hashToken } from '../agent-tokens'
import { createAdminApiApp } from '../app'
import { adminApiConfigLayer, envSchema } from '../config'
import { adminDatabaseFromPool } from '../db'
import { RateLimiterLive } from '../rate-limit'
import { makeAdminApiRuntime } from '../runtime'

/** Test-only: an admin API over a real Postgres, with a human owner and two agents (one with catalog:read, one without) */
export const ORIGIN = 'https://admin.dxrating.net'
export const CATALOG_READER = 'dxa_synthetic-catalog-reader'
export const ANNOUNCEMENT_READER = 'dxa_synthetic-announcement-reader'

export const makeCatalogTestApp = (url: string) => {
  const pool = new pg.Pool({ connectionString: url })
  const config = envSchema.parse({
    NODE_ENV: 'test',
    ADMIN_ORIGIN: ORIGIN,
    ADMIN_HUMAN_EMAILS: 'owner@example.invalid',
    ADMIN_AGENT_TOKENS: JSON.stringify([
      {
        principal: 'catalog-reader',
        sha256: hashToken(CATALOG_READER),
        scopes: ['catalog:read'],
        expiresAt: '2999-01-01T00:00:00Z',
      },
      {
        principal: 'announcement-reader',
        sha256: hashToken(ANNOUNCEMENT_READER),
        scopes: ['announcements:read'],
        expiresAt: '2999-01-01T00:00:00Z',
      },
    ]),
  })
  const runtime = makeAdminApiRuntime(
    Layer.mergeAll(
      adminApiConfigLayer(config),
      accessVerifierTestLayer({
        owner: { kind: 'user', email: 'owner@example.invalid' },
        robot: { kind: 'service', commonName: 'svc' },
      }),
      RateLimiterLive,
      adminDatabaseFromPool(pool),
      HttpClientLive,
    ),
  )
  const app = createAdminApiApp(runtime)
  const human = { 'cf-access-jwt-assertion': 'owner', origin: ORIGIN }
  const agent = (token: string) => ({ 'cf-access-jwt-assertion': 'robot', authorization: `Bearer ${token}` })
  const get = (path: string, headers: Record<string, string> = human) =>
    app.fetch(new Request(`http://admin-api.internal/api${path}`, { headers }))
  const close = async () => {
    await runtime.dispose()
    await pool.end()
  }
  return { pool, get, human, agent, close }
}