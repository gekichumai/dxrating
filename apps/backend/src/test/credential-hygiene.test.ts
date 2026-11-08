import { randomUUID } from 'node:crypto'
import { format } from 'node:util'
import * as Sentry from '@sentry/node'
import { Effect } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Design §7.2: a failing maimai NET import (a login error that echoes the credentials, and a difficulty page that
 * keeps failing) driven through the new server import route and every legacy NET route must leave the SEGA ID and
 * password in none of: evlog lines (and anything else on the console), Sentry events, breadcrumbs and logs (captured
 * by a test transport with the production options), PostHog batches, the responses, and the database.
 */

const SEGA_ID = 'leaktest-sega-id-7f3a'
const PASSWORD = 'leaktest-pass-9c2e'

vi.hoisted(() => {
  process.env.CLOUD_SAVE_MODE = 'allowlist'
  process.env.SERVER_IMPORTS = 'on'
  process.env.MCP_POSTHOG_KEY = 'phc_synthetic_test_key'
  process.env.MCP_POSTHOG_HOST = 'https://posthog.invalid'
})

const upstream = vi.hoisted(() => {
  const realFetch = globalThis.fetch
  const state = {
    net: undefined as undefined | ((url: string, init?: RequestInit) => Promise<Response>),
    posthog: [] as string[],
  }
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return realFetch(input, init)
    if (url.hostname === 'posthog.invalid') {
      state.posthog.push(await new Response(init?.body).text())
      return Response.json({ status: 1 })
    }
    throw new Error(`Unexpected upstream request ${url.href}`)
  }) as typeof fetch
  return state
})

vi.mock('undici', async (original) => {
  const actual = await original<typeof import('undici')>()
  return {
    ...actual,
    fetch: (input: string | URL, init?: RequestInit) =>
      upstream.net ? upstream.net(String(input), init) : Promise.reject(new Error('Unexpected maimai NET request')),
  }
})

import { buildSentryOptions } from '../lib/functions/sentry'
import { heldCredentialCount } from '../lib/credential-hygiene'
import { appRuntime } from '../runtime'
import { McpAnalyticsService } from '../services/mcp/analytics'
import { api, session } from './cloud-save-helpers'
import { CHARTS, createFakeNet, netRecord, postNetImport } from './server-import-fixtures'
import { cleanDatabase, getBaseUrl, setupTestServer, teardownTestServer } from './setup'

const envelopes: string[] = []
const consoleLines: string[] = []
const responses: string[] = []

const fakeNet = (failDifficulty?: number) =>
  createFakeNet({
    id: SEGA_ID,
    password: PASSWORD,
    friendCode: '9012345678901',
    records: [netRecord(CHARTS.kiminoDxMaster, '100.5000%')],
    failDifficulty,
  })

const LOGIN_ERROR = { region: 'intl', id: SEGA_ID, password: `${PASSWORD}-wrong` }
const PAGE_FAILURE = { region: 'jp', id: SEGA_ID, password: PASSWORD }

let pool: pg.Pool

beforeAll(async () => {
  Sentry.init(
    buildSentryOptions('test', {
      dsn: 'https://public@o0.ingest.sentry.io/0',
      tracesSampleRate: 1,
      transport: (options) =>
        Sentry.createTransport(options, async (request) => {
          envelopes.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body))
          return { statusCode: 200 }
        }),
    }),
  )
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console)
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleLines.push(format(...args))
      original(...args)
    })
  }
  await setupTestServer()
  await cleanDatabase()
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
})

afterAll(async () => {
  await pool.end()
  await teardownTestServer()
  await Sentry.close(2000)
})

const post = async (path: string, body: unknown, cookie?: string) => {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  responses.push(text)
  return { status: response.status, text }
}

describe('credential hygiene of the maimai NET routes', () => {
  it('never lets the SEGA ID or password reach logs, Sentry, PostHog, responses or the database', async () => {
    const user = await session(pool, `hygiene-${randomUUID().slice(0, 8)}@example.com`)
    const save = await api(user.cookie, 'POST', '/saves', { name: 'JP', region: 'jp' })
    const saveId = save.body.id as string

    // The new server import route: a login error (intl, whose error page echoes the credentials) and a page failure
    for (const [credentials, failDifficulty, code] of [
      [LOGIN_ERROR, undefined, 'INVALID_CREDENTIALS'],
      [PAGE_FAILURE, 3, 'UPSTREAM_ERROR'],
    ] as const) {
      upstream.net = fakeNet(failDifficulty).fetch
      const response = await postNetImport(user.cookie, saveId, {
        idempotencyKey: `hygiene-${randomUUID()}`,
        trigger: 'user',
        ...credentials,
      })
      responses.push(response.text)
      expect(response.events.at(-1)).toMatchObject({ event: 'error', data: { code } })
    }

    // The legacy routes, unchanged in behavior: SSE v1, JSON v0 and the oRPC procedure
    for (const [credentials, failDifficulty] of [
      [LOGIN_ERROR, undefined],
      [PAGE_FAILURE, 3],
    ] as const) {
      upstream.net = fakeNet(failDifficulty).fetch
      const v1 = await post(`/functions/fetch-net-records/v1/${credentials.region}`, credentials)
      expect(v1.status).toBe(200)
      expect(v1.text).toContain('event: error')
      upstream.net = fakeNet(failDifficulty).fetch
      expect((await post('/functions/fetch-net-records/v0', credentials)).status).toBe(500)
      upstream.net = fakeNet(failDifficulty).fetch
      expect((await post('/api/v1/io/import/maimai-net', credentials)).status).toBeGreaterThanOrEqual(400)
    }

    // An MCP exchange, so PostHog has something to send
    await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    await appRuntime.runPromise(Effect.flatMap(McpAnalyticsService, (analytics) => Effect.promise(analytics.flush)))
    await Sentry.flush(5000)

    // The checks are meaningful: each channel captured something
    expect(consoleLines.some((line) => line.includes('/functions/fetch-net-records/v1'))).toBe(true)
    expect(consoleLines.some((line) => line.includes('imports/maimai-net'))).toBe(true)
    expect(envelopes.some((envelope) => envelope.includes('"type":"event"'))).toBe(true)
    expect(envelopes.some((envelope) => envelope.includes('breadcrumbs'))).toBe(true)
    expect(upstream.posthog.length).toBeGreaterThan(0)
    const tables = (
      await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      )
    ).rows.map((row) => row.table_name)
    const database: string[] = []
    for (const table of tables) {
      const rows = await pool.query<{ row: string }>(`SELECT row_to_json(t)::text AS row FROM "${table}" t`)
      database.push(...rows.rows.map((row) => `${table}: ${row.row}`))
    }
    const jobs = (await pool.query(`SELECT row_to_json(j)::text AS row FROM score_import_jobs j`)).rows
    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => JSON.parse(job.row).error_code).sort()).toEqual(['invalid_credentials', 'upstream_error'])
    expect(database.some((row) => row.startsWith('score_import_jobs'))).toBe(true)

    for (const [channel, texts] of [
      ['console / evlog', consoleLines],
      ['Sentry envelopes', envelopes],
      ['PostHog', upstream.posthog],
      ['responses', responses],
      ['database', database],
      ['import job rows', jobs.map((job) => job.row)],
    ] as const) {
      for (const text of texts) {
        expect(text.includes(SEGA_ID), `${channel} carries the SEGA ID: ${text.slice(0, 300)}`).toBe(false)
        expect(text.includes(PASSWORD), `${channel} carries the password: ${text.slice(0, 300)}`).toBe(false)
      }
    }
    // the intl error page did echo the credentials: the legacy error message was scrubbed, not merely clean
    expect(responses.some((text) => text.includes('[Filtered]'))).toBe(true)
  })

  it('filters the credentials of a chunked body (no Content-Length) on the legacy JSON routes', async () => {
    const chunked = async (path: string, body: unknown) => {
      const bytes = new TextEncoder().encode(JSON.stringify(body))
      const response = await fetch(`${getBaseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, 10))
            controller.enqueue(bytes.slice(10))
            controller.close()
          },
        }),
        duplex: 'half',
      } as RequestInit)
      const text = await response.text()
      return { status: response.status, text }
    }
    // credentials of their own, so the earlier requests' grace period cannot filter them
    const segaId = 'leaktest-chunked-id-52d1'
    const password = 'leaktest-chunked-pass-0be4'
    // the SEGA ID is right, the password wrong: the intl error page echoes the SEGA ID
    const loginError = { region: 'intl', id: segaId, password }
    const net = () => createFakeNet({ id: segaId, password: 'synthetic-right-password' }).fetch
    const before = envelopes.length
    const consoleBefore = consoleLines.length
    upstream.net = net()
    const v0 = await chunked('/functions/fetch-net-records/v0', loginError)
    expect(v0.status).toBe(500)
    upstream.net = net()
    const orpc = await chunked('/api/v1/io/import/maimai-net', loginError)
    expect(orpc.status).toBeGreaterThanOrEqual(400)
    await Sentry.flush(5000)
    const sent = envelopes.slice(before)
    const logged = consoleLines.slice(consoleBefore)
    expect(sent.length).toBeGreaterThan(0)
    // the intl error page echoed the credentials into the error, which was filtered rather than absent
    expect([...sent, ...logged].some((text) => text.includes('[Filtered]'))).toBe(true)
    for (const text of [...sent, ...logged, v0.text, orpc.text]) {
      expect(text.includes(segaId), `carries the SEGA ID: ${text.slice(0, 300)}`).toBe(false)
      expect(text.includes(password), `carries the password: ${text.slice(0, 300)}`).toBe(false)
    }
  })

  it('answers a malformed body with 400 and sends neither credential to Sentry, logs or the response', async () => {
    const segaId = 'leakmalformed-id-41c7'
    const password = 'leakpw-3e9a'
    const raw = async (path: string, body: string, contentType = 'application/json') => {
      const response = await fetch(`${getBaseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      })
      return { status: response.status, text: await response.text() }
    }
    const bodies: Array<[string, string]> = [
      // a single-quoted password and an unquoted SEGA ID: V8's SyntaxError quotes the text around the bad token
      [`{"region":"intl","id":"${segaId}","password":'${password}'}`, 'application/json'],
      [`{"region":"intl","id":${segaId},"password":"${password}"}`, 'application/json'],
      [`region=intl&id=${segaId}&password=${password}`, 'application/x-www-form-urlencoded'],
    ]
    const before = envelopes.length
    const consoleBefore = consoleLines.length
    const answers: string[] = []
    for (const [body, contentType] of bodies) {
      for (const path of ['/functions/fetch-net-records/v0', '/functions/fetch-net-records/v1/intl']) {
        const response = await raw(path, body, contentType)
        expect(response.status, `${path} ${body}`).toBe(400)
        answers.push(response.text)
      }
    }
    // the oRPC procedure answers its own 400 to malformed JSON (it reads a form body as a valid input); the new route
    // needs a session first
    for (const [body, contentType] of bodies.slice(0, 2)) {
      const response = await raw('/api/v1/io/import/maimai-net', body, contentType)
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status, `${contentType} ${body}`).toBeLessThan(500)
      answers.push(response.text)
    }
    const user = await session(pool, `hygiene-malformed-${randomUUID().slice(0, 8)}@example.com`)
    const save = await api(user.cookie, 'POST', '/saves', { name: 'JP', region: 'jp' })
    for (const [body, contentType] of bodies) {
      const response = await fetch(`${getBaseUrl()}/api/v1/saves/${save.body.id as string}/imports/maimai-net`, {
        method: 'POST',
        headers: { 'Content-Type': contentType, Cookie: user.cookie },
        body,
      })
      expect(response.status).toBe(400)
      answers.push(await response.text())
    }
    await Sentry.flush(5000)
    for (const text of [...envelopes.slice(before), ...consoleLines.slice(consoleBefore), ...answers]) {
      expect(text.includes(segaId), `carries the SEGA ID: ${text.slice(0, 300)}`).toBe(false)
      expect(text.includes(password), `carries the password: ${text.slice(0, 300)}`).toBe(false)
    }
  })

  it('lets go of the credentials of finished requests after the grace period', async () => {
    const { holdCredentials } = await import('../lib/credential-hygiene')
    vi.useFakeTimers()
    try {
      const before = heldCredentialCount()
      const release = holdCredentials(['grace-period-secret'])
      expect(heldCredentialCount()).toBe(before + 1)
      release()
      expect(heldCredentialCount()).toBe(before + 1)
      vi.advanceTimersByTime(30_001)
      expect(heldCredentialCount()).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })
})