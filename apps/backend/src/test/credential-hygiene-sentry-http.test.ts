import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import net from 'node:net'
import * as Sentry from '@sentry/node'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Design §7.2, through Sentry's real outgoing HTTP instrumentation: the maimai NET client's undici requests are not
 * replaced (unlike credential-hygiene.test.ts); undici's `Agent` connects to a local fake maimai NET instead of the
 * real hosts, so Sentry's undici diagnostics-channel instrumentation records breadcrumbs (`url`, `http.query`) and
 * spans (`url.full`, `url.query`) for every request. A successful intl login redirects with a session hand-off
 * token in `?ssid=`, which must reach no Sentry envelope, nor may the SEGA ID or password.
 */

const SEGA_ID = 'leaktest-http-sega-id-41b7'
const PASSWORD = 'leaktest-http-pass-d93a'
const SSID = 'leaktest-ssid-token-8e2f61'

vi.hoisted(() => {
  process.env.CLOUD_SAVE_MODE = 'allowlist'
  process.env.SERVER_IMPORTS = 'on'
})

const fakeUpstream = vi.hoisted(() => ({ port: 0 }))

vi.mock('undici', async (original) => {
  const actual = await original<typeof import('undici')>()
  const { connect } = await import('node:net')
  /** Every connection of the NET client goes to the local fake maimai NET, in plain HTTP */
  class LocalAgent extends actual.Agent {
    constructor(options?: ConstructorParameters<typeof actual.Agent>[0]) {
      super({
        ...options,
        connect: (_options, callback) => {
          const socket = connect(fakeUpstream.port, '127.0.0.1')
          socket.once('connect', () => callback(null, socket))
          socket.once('error', (error) => callback(error, null))
          return socket
        },
      })
    }
  }
  return { ...actual, Agent: LocalAgent }
})

// The published catalog is not in the test database: imports resolve through the bundled snapshot
vi.mock('../services/cloud-save/import-catalog', async () => {
  const { Effect } = await import('effect')
  const { getSongCatalog } = await import('@gekichumai/maimai-domain')
  const { catalogSnapshot } = await import('@gekichumai/dxdata/snapshot')
  const { VersionEnum } = await import('@gekichumai/dxdata')
  return {
    importCatalog: Effect.sync(() => getSongCatalog(catalogSnapshot, VersionEnum.MAGiCAL)),
    ImportCatalogUnavailable: class ImportCatalogUnavailable extends Error {},
  }
})

import { buildSentryOptions } from '../lib/functions/sentry'
import { api, session } from './cloud-save-helpers'
import { CHARTS, createFakeNet, netRecord, postNetImport } from './server-import-fixtures'
import { cleanDatabase, getBaseUrl, setupTestServer, teardownTestServer } from './setup'

const envelopes: string[] = []
let upstreamServer: Server
let pool: pg.Pool
let fake: { fetch: (href: string, init?: RequestInit) => Promise<Response>; calls: string[] }

/** The fake NET with the login redirect carrying {@link SSID} */
const fakeNet = (failDifficulty?: number): typeof fake => {
  const inner = createFakeNet({
    id: SEGA_ID,
    password: PASSWORD,
    friendCode: '9012345678901',
    records: [netRecord(CHARTS.kiminoDxMaster, '100.5000%')],
    failDifficulty,
  })
  return {
    calls: inner.calls,
    fetch: async (href: string, init?: RequestInit) => {
      const url = href.replace(`ssid=${SSID}`, 'ssid=synthetic')
      const response = await inner.fetch(url, init)
      const location = response.headers.get('location')
      if (location?.includes('ssid=synthetic')) {
        return new Response(null, { status: 302, headers: { location: location.replace('synthetic', SSID) } })
      }
      return response
    },
  }
}

beforeAll(async () => {
  upstreamServer = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const href = `https://${request.headers.host}${request.url}`
    try {
      const answer = await fake.fetch(href, {
        method: request.method,
        body: chunks.length > 0 ? Buffer.concat(chunks).toString() : undefined,
      })
      const headers: Record<string, string> = {}
      answer.headers.forEach((value, key) => {
        headers[key] = value
      })
      response.writeHead(answer.status, headers)
      response.end(Buffer.from(await answer.arrayBuffer()))
    } catch {
      response.writeHead(500)
      response.end()
    }
  })
  await new Promise<void>((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve))
  fakeUpstream.port = (upstreamServer.address() as net.AddressInfo).port

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
  await setupTestServer()
  await cleanDatabase()
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
})

afterAll(async () => {
  await pool.end()
  await teardownTestServer()
  await Sentry.close(2000)
  await new Promise<void>((resolve) => upstreamServer.close(() => resolve()))
})

describe('credential hygiene through Sentry HTTP instrumentation', () => {
  it('keeps the intl login session token, SEGA ID and password out of breadcrumbs, spans and events', async () => {
    const user = await session(pool, `hygiene-http-${randomUUID().slice(0, 8)}@example.com`)
    const save = await api(user.cookie, 'POST', '/saves', { name: 'Intl', region: 'intl' })
    const saveId = save.body.id as string
    const credentials = { region: 'intl', id: SEGA_ID, password: PASSWORD }

    // A successful import through the new route
    fake = fakeNet()
    const imported = await postNetImport(user.cookie, saveId, {
      idempotencyKey: `hygiene-http-${randomUUID()}`,
      trigger: 'user',
      ...credentials,
    })
    expect(imported.events.at(-1)).toMatchObject({ event: 'done' })
    // the login redirect really went through the instrumented HTTP stack
    expect(fake.calls.some((call) => call.startsWith('GET https://maimaidx-eng.com/maimai-mobile/'))).toBe(true)

    // A legacy JSON import that logs in, then fails on a page: an error event carrying the request's breadcrumbs
    fake = fakeNet(3)
    const legacy = await fetch(`${getBaseUrl()}/functions/fetch-net-records/v0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    expect(legacy.status).toBe(500)
    await legacy.text()

    await Sentry.flush(5000)
    const sent = envelopes.join('\n')
    // the checks are meaningful: Sentry recorded the outgoing maimai NET requests
    expect(sent).toContain('maimaidx-eng.com')
    expect(envelopes.some((envelope) => envelope.includes('"type":"event"'))).toBe(true)
    expect(envelopes.some((envelope) => envelope.includes('"type":"transaction"'))).toBe(true)
    expect(sent).toContain('ssid=[Filtered]')

    for (const secret of [SSID, SEGA_ID, PASSWORD]) {
      const at = sent.indexOf(secret)
      expect(at, `Sentry carries ${secret}: ${sent.slice(Math.max(0, at - 200), at + 100)}`).toBe(-1)
    }
  })
})