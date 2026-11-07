import { sql } from 'drizzle-orm'
import { Effect, Layer, ManagedRuntime } from 'effect'
import pg from 'pg'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { HttpClientLive } from '@gekichumai/backend/http-client'
import { accessVerifierTestLayer } from './access'
import { createAdminApiApp } from './app'
import { adminApiConfigLayer, envSchema } from './config'
import { AdminDatabase, adminDatabaseFromPool, describeCause, passwordOf, redact } from './db'
import { RateLimiterLive } from './rate-limit'
import { makeAdminApiRuntime } from './runtime'

// Synthetic credentials on a host that never resolves (RFC 6761 `.invalid`)
const URL_WITH_SECRET = 'postgres://dxrating:synthetic-secret-pw@db-host.invalid:5432/dxrating'

const logged = () => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  return () => spy.mock.calls.map(([line]) => String(line))
}
afterEach(() => vi.restoreAllMocks())

describe('describeCause', () => {
  it('reports the innermost cause, never the query a wrapper put in its message', () => {
    const driver = Object.assign(new Error('relation "announcements" does not exist'), {
      code: '42P01',
      severity: 'ERROR',
      routine: 'parserOpenTable',
    })
    const wrapped = new Error('Failed query: select * from announcements where title = $1\nparams: private text', {
      cause: driver,
    })
    expect(describeCause(wrapped)).toEqual({
      name: 'Error',
      code: '42P01',
      severity: 'ERROR',
      syscall: undefined,
      hostname: undefined,
      address: undefined,
      port: undefined,
      routine: 'parserOpenTable',
      message: 'relation "announcements" does not exist',
    })
  })

  it('takes the first failure of an AggregateError', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.2:5432'), {
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '10.0.0.2',
      port: 5432,
    })
    expect(describeCause(new AggregateError([refused]))).toMatchObject({
      code: 'ECONNREFUSED',
      syscall: 'connect',
      port: 5432,
    })
  })

  it('redacts connection strings and the configured password', () => {
    const cause = new Error(`bad ${URL_WITH_SECRET} and synthetic-secret-pw again`)
    const { message } = describeCause(cause, passwordOf(URL_WITH_SECRET))
    expect(message).toBe('bad [redacted-url] and [redacted] again')
    expect(redact('postgresql://u:p@h/db')).toBe('[redacted-url]')
    expect(passwordOf('not a url')).toEqual([])
  })
})

describe('AdminDatabase', () => {
  const pool = new pg.Pool({ connectionString: URL_WITH_SECRET, connectionTimeoutMillis: 5_000 })
  afterAll(() => pool.end())
  const layer = adminDatabaseFromPool(pool, passwordOf(URL_WITH_SECRET))

  it('logs one JSON line with the operation and cause when a query fails, without the URL or password', async () => {
    const lines = logged()
    const runtime = ManagedRuntime.make(layer)
    const exit = await runtime.runPromiseExit(
      Effect.flatMap(AdminDatabase, (db) => db.use('list announcements', (d) => d.execute(sql`select 1`))),
    )
    await runtime.dispose()
    expect(exit._tag).toBe('Failure')
    const [line, ...rest] = lines()
    expect(rest).toEqual([])
    expect(JSON.parse(line!)).toMatchObject({
      level: 'error',
      event: 'db_error',
      operation: 'list announcements',
      cause: { code: 'ENOTFOUND', hostname: 'db-host.invalid' },
    })
    expect(line).not.toContain('synthetic-secret-pw')
    expect(line).not.toContain('postgres://')
  })

  it('answers /health?db=1 with 503 when the database is unreachable, and /health without touching it', async () => {
    const runtime = makeAdminApiRuntime(
      Layer.mergeAll(
        RateLimiterLive,
        HttpClientLive,
        layer,
        adminApiConfigLayer(envSchema.parse({ NODE_ENV: 'test' })),
        accessVerifierTestLayer({}),
      ),
    )
    const app = createAdminApiApp(runtime)
    const lines = logged()
    const plain = await app.fetch(new Request('http://admin-api.internal/health'))
    expect(plain.status).toBe(200)
    expect(lines()).toEqual([])

    const checked = await app.fetch(new Request('http://admin-api.internal/health?db=1'))
    expect(checked.status).toBe(503)
    expect(await checked.json()).toEqual({ ok: false, db: 'unreachable' })
    expect(JSON.parse(lines()[0]!)).toMatchObject({ event: 'db_error', operation: 'ping' })
    await runtime.dispose()
  })
})