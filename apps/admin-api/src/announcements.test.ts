import * as path from 'node:path'
import { HttpClient } from '@gekichumai/backend/http-client'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpClient as NativeHttpClient } from 'effect/http'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { accessVerifierTestLayer } from './access'
import { createAdminApiApp } from './app'
import { hashToken } from './agent-tokens'
import { adminApiConfigLayer, envSchema } from './config'
import { adminDatabaseFromPool } from './db'
import { RateLimiterLive } from './rate-limit'
import { makeAdminApiRuntime } from './runtime'
import { advance, stableJson } from './announcements'

// Integration: a real Postgres with apps/backend's migrations (CI provides one; locally set ADMIN_API_TEST_DATABASE_URL)
const url = process.env.ADMIN_API_TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORIGIN = 'https://admin.dxrating.net'
const READ = 'dxa_synthetic-read'
const WRITE = 'dxa_synthetic-write'
const purge = vi.fn<(request: Request) => Promise<Response>>()

suite('announcements (admin API)', () => {
  const pool = new pg.Pool({ connectionString: url })
  const config = envSchema.parse({
    NODE_ENV: 'test',
    ADMIN_ORIGIN: ORIGIN,
    ADMIN_HUMAN_EMAILS: 'owner@example.invalid',
    CLOUDFLARE_ZONE_ID: 'zone',
    CLOUDFLARE_CACHE_PURGE_TOKEN: 'synthetic',
    ADMIN_AGENT_TOKENS: JSON.stringify([
      {
        principal: 'reader',
        sha256: hashToken(READ),
        scopes: ['announcements:read'],
        expiresAt: '2999-01-01T00:00:00Z',
      },
      {
        principal: 'writer',
        sha256: hashToken(WRITE),
        scopes: ['announcements:read', 'announcements:write'],
        expiresAt: '2999-01-01T00:00:00Z',
      },
    ]),
  })
  const fakeFetch = ((input: RequestInfo | URL, init?: RequestInit) => purge(new Request(input, init))) as typeof fetch
  const http = Layer.effect(HttpClient, Effect.map(NativeHttpClient.HttpClient, NativeHttpClient.withScope)).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fakeFetch)),
  )
  const runtime = makeAdminApiRuntime(
    Layer.mergeAll(
      adminApiConfigLayer(config),
      accessVerifierTestLayer({
        owner: { kind: 'user', email: 'owner@example.invalid' },
        robot: { kind: 'service', commonName: 'svc' },
      }),
      RateLimiterLive,
      adminDatabaseFromPool(pool),
      http,
    ),
  )
  const app = createAdminApiApp(runtime)
  const human = { 'cf-access-jwt-assertion': 'owner', origin: ORIGIN, 'content-type': 'application/json' }
  const agent = (token: string) => ({
    'cf-access-jwt-assertion': 'robot',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  })
  const post = (p: string, body: unknown, headers: Record<string, string> = human) =>
    app.fetch(new Request(`http://admin-api.internal/api${p}`, { method: 'POST', headers, body: JSON.stringify(body) }))
  const get = (p: string, headers: Record<string, string> = human) =>
    app.fetch(new Request(`http://admin-api.internal/api${p}`, { headers }))

  const fields = (overrides: Record<string, unknown> = {}) => ({
    severity: 'info',
    title: { en: 'Maintenance', ja: 'メンテナンス', 'zh-Hant': '  ' },
    body: { en: 'Tonight 2–3am UTC.' },
    link: { url: '/news', label: { en: 'Details' } },
    startsAt: null,
    endsAt: null,
    platforms: [],
    regions: [],
    minAppVersion: null,
    maxAppVersion: null,
    dismissible: true,
    ...overrides,
  })

  beforeAll(async () => {
    const migrations = readMigrationFiles({ migrationsFolder: path.resolve(__dirname, '../../backend/drizzle') })
    for (const migration of migrations) {
      for (const statement of migration.sql) {
        if (!statement.trim()) continue
        await pool.query(statement).catch((e: Error) => {
          if (!/already exists|duplicate key/.test(e.message)) throw e
        })
      }
    }
  })
  beforeEach(async () => {
    await pool.query('DELETE FROM announcements')
    purge.mockReset()
    purge.mockImplementation(async () => Response.json({ success: true }))
  })
  afterAll(async () => {
    await runtime.dispose()
    await pool.end()
  })

  it('creates as the human principal, drops blank translations and invalidates the edge tag', async () => {
    const res = await post('/announcements', { announcement: fields() })
    expect(res.status).toBe(200)
    const out = (await res.json()) as any
    expect(out.edgeCache).toBe('invalidated')
    expect(out.announcement.title).toEqual({ en: 'Maintenance', ja: 'メンテナンス' })
    expect(out.announcement.createdBy).toBe('human:owner@example.invalid')
    expect(out.preview.title['zh-Hant']).toEqual({ text: 'Maintenance', from: 'en' })
    const call = purge.mock.calls[0]![0]
    expect(call.url).toBe('https://api.cloudflare.com/client/v4/zones/zone/invalidate_cache')
    expect(await call.json()).toEqual({ tags: ['announcements'] })
  })

  it('dry run validates and previews without saving or purging', async () => {
    const out = (await (await post('/announcements', { announcement: fields(), dryRun: true })).json()) as any
    expect(out).toMatchObject({ dryRun: true, announcement: null, edgeCache: 'skipped' })
    expect((await pool.query('SELECT count(*)::int AS n FROM announcements')).rows[0].n).toBe(0)
    expect(purge).not.toHaveBeenCalled()
  })

  it('bumps the revision only when text or link change, whatever the key order', async () => {
    const created = (await (await post('/announcements', { announcement: fields() })).json()) as any
    const id = created.announcement.id
    const same = { ...fields({ title: { ja: 'メンテナンス', en: 'Maintenance' }, dismissible: false }), id }
    expect(((await (await post('/announcements/update', { announcement: same })).json()) as any).revision).toBe(1)
    const changed = { ...fields({ body: { en: 'Moved to 3–4am UTC.' } }), id }
    const out = (await (await post('/announcements/update', { announcement: changed })).json()) as any
    expect(out.revision).toBe(2)
    expect(out.announcement.updatedBy).toBe('human:owner@example.invalid')
  })

  it('bumps the revision when the severity rises, not when it falls or dismissible changes', async () => {
    const created = (await (await post('/announcements', { announcement: fields() })).json()) as any
    const id = created.announcement.id
    const up = (await (
      await post('/announcements/update', { announcement: { ...fields({ severity: 'critical' }), id } })
    ).json()) as any
    expect(up.revision).toBe(2)
    const down = (await (
      await post('/announcements/update', { announcement: { ...fields({ severity: 'info', dismissible: false }), id } })
    ).json()) as any
    expect(down.revision).toBe(2)
  })

  it('serialises concurrent edits: each content change gets its own revision', async () => {
    const created = (await (await post('/announcements', { announcement: fields() })).json()) as any
    const id = created.announcement.id
    await Promise.all(
      ['A', 'B', 'C'].map((text) =>
        post('/announcements/update', { announcement: { ...fields({ body: { en: text } }), id } }),
      ),
    )
    expect((await pool.query('SELECT revision FROM announcements WHERE id = $1', [id])).rows[0].revision).toBe(4)
  })

  it('previews blank translations as falling back, like the clients', async () => {
    const out = (await (await post('/announcements', { announcement: fields(), dryRun: true })).json()) as any
    expect(out.preview.title.ja).toEqual({ text: 'メンテナンス', from: 'ja' })
    expect(out.preview.title['zh-Hans']).toEqual({ text: 'Maintenance', from: 'en' })
  })

  it('refuses a window that ends before its effective start, in a dry run too', async () => {
    const bad = { announcement: fields({ startsAt: null, endsAt: '2020-01-01T00:00:00Z' }) }
    expect((await post('/announcements', { ...bad, dryRun: true })).status).toBe(400)
    expect((await post('/announcements', bad)).status).toBe(400)
    const created = (await (await post('/announcements', { announcement: fields() })).json()) as any
    const update = { announcement: { ...fields({ endsAt: '2020-01-01T00:00:00Z' }), id: created.announcement.id } }
    expect((await post('/announcements/update', { ...update, dryRun: true })).status).toBe(400)
  })

  it('treats an empty start on update as now: scheduled goes live, live keeps its start', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const scheduled = (await (
      await post('/announcements', { announcement: fields({ startsAt: future }) })
    ).json()) as any
    const live = (await (
      await post('/announcements/update', { announcement: { ...fields(), id: scheduled.announcement.id } })
    ).json()) as any
    expect(Date.parse(live.announcement.startsAt)).toBeLessThanOrEqual(Date.now())
    const again = (await (
      await post('/announcements/update', { announcement: { ...fields(), id: scheduled.announcement.id } })
    ).json()) as any
    expect(again.announcement.startsAt).toBe(live.announcement.startsAt)
  })

  it('refuses a save based on a stale read with 409', async () => {
    const created = (await (await post('/announcements', { announcement: fields() })).json()) as any
    const id = created.announcement.id
    const read = created.announcement.updatedAt
    expect(
      (
        await post('/announcements/update', {
          announcement: { ...fields({ body: { en: 'x' } }), id },
          ifUpdatedAt: read,
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await post('/announcements/update', {
          announcement: { ...fields({ body: { en: 'y' } }), id },
          ifUpdatedAt: read,
        })
      ).status,
    ).toBe(409)
  })

  it('ends a scheduled announcement by moving its start just before now', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const created = (await (await post('/announcements', { announcement: fields({ startsAt: future }) })).json()) as any
    const out = (await (await post('/announcements/end', { id: created.announcement.id })).json()) as any
    expect(Date.parse(out.announcement.endsAt)).toBeLessThanOrEqual(Date.now())
    expect(Date.parse(out.announcement.startsAt)).toBeLessThan(Date.parse(out.announcement.endsAt))
  })

  it('enforces scopes for agents and records the agent as the author', async () => {
    expect((await get('/announcements', agent(READ))).status).toBe(200)
    expect((await post('/announcements', { announcement: fields() }, agent(READ))).status).toBe(403)
    const out = (await (await post('/announcements', { announcement: fields() }, agent(WRITE))).json()) as any
    expect(out.announcement.createdBy).toBe('agent:writer')
  })

  it('rejects invalid input and unknown ids', async () => {
    expect((await post('/announcements', { announcement: fields({ title: { ja: 'x' } }) })).status).toBe(400)
    expect(
      (await post('/announcements', { announcement: fields({ link: { url: 'javascript:alert(1)' } }) })).status,
    ).toBe(400)
    expect((await post('/announcements/end', { id: 999999 })).status).toBe(404)
  })

  it('reports a failed purge without failing the write', async () => {
    purge.mockImplementation(async () => Response.json({ success: false }, { status: 500 }))
    const out = (await (await post('/announcements', { announcement: fields() })).json()) as any
    expect(out.edgeCache).toBe('failed')
    expect(out.announcement.id).toBeGreaterThan(0)
  })
})

describe('advance', () => {
  it('always moves past the stored timestamp, even within the same millisecond', () => {
    const t = new Date('2026-01-01T00:00:00.000Z')
    expect(advance(t, t).getTime()).toBe(t.getTime() + 1)
    expect(advance(t, new Date(t.getTime() - 5)).getTime()).toBe(t.getTime() + 1)
    expect(advance(t, new Date(t.getTime() + 50)).getTime()).toBe(t.getTime() + 50)
  })
})

describe('stableJson', () => {
  it('ignores key order at every level', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 2 }, b: 1 }))
  })
})