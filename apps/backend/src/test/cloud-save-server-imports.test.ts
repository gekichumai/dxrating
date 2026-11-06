import { createHash, randomUUID } from 'node:crypto'
import { Effect, Exit, Option } from 'effect'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// config.ts reads the environment once, at import
vi.hoisted(() => {
  process.env.CLOUD_SAVE_MODE = 'allowlist'
  process.env.SERVER_IMPORTS = 'on'
  process.env.LXNS_CLIENT_ID = 'synthetic-client'
  process.env.LXNS_CLIENT_SECRET = 'synthetic-secret'
})

// Every upstream is synthetic: maimai NET behind the NET client's undici fetch, LXNS and Diving-Fish behind the global
// fetch of the Effect HTTP client (the local test server passes through)
const upstream = vi.hoisted(() => {
  const realFetch = globalThis.fetch
  const state = {
    net: undefined as undefined | ((url: string, init?: RequestInit) => Promise<Response>),
    http: undefined as
      | undefined
      | ((url: URL, init?: RequestInit) => Promise<Response | undefined> | Response | undefined),
    httpCalls: [] as string[],
  }
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return realFetch(input, init)
    state.httpCalls.push(`${init?.method ?? 'GET'} ${url.href}`)
    const response = await state.http?.(url, init)
    if (response) return response
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

/** Song titles the import catalog leaves out (a catalog that has not caught up with the game yet) */
const catalogState = vi.hoisted(() => ({ missingTitles: new Set<string>() }))

// The published catalog is not in the test database: imports resolve through the bundled snapshot
vi.mock('../services/cloud-save/import-catalog', async () => {
  const { Effect } = await import('effect')
  const { getSongCatalog } = await import('@gekichumai/maimai-domain')
  const { catalogSnapshot } = await import('@gekichumai/dxdata/snapshot')
  const { VersionEnum } = await import('@gekichumai/dxdata')
  const full = getSongCatalog(catalogSnapshot, VersionEnum.MAGiCAL)
  return {
    importCatalog: Effect.sync(() =>
      catalogState.missingTitles.size === 0
        ? full
        : getSongCatalog(
            {
              ...catalogSnapshot,
              songs: catalogSnapshot.songs.filter((song) => !catalogState.missingTitles.has(song.title)),
            },
            VersionEnum.MAGiCAL,
          ),
    ),
    ImportCatalogUnavailable: class ImportCatalogUnavailable extends Error {},
  }
})

import { canonicalSha256 } from '../services/cloud-save/jobs'
import { NET_IMPORT_GLOBAL_CONCURRENCY, runningNetImports } from '../services/cloud-save/net-import-route'
import { cloudSaveRateLimits } from '../services/rate-limit'
import { CloudSaveBusy } from '../services/cloud-save/errors'
import { SAVE_LOCK_TIMEOUT_MS } from '../services/cloud-save/saves'
import {
  beginServerImport,
  failInterruptedImport,
  runServerImport,
  type UpstreamFetch,
} from '../services/cloud-save/server-imports'
import { Database } from '../db/index'
import { appRuntime } from '../runtime'
import { runDatabase, session, api, sheetId } from './cloud-save-helpers'
import { startImportJob } from '../services/cloud-save/jobs'
import {
  CHARTS,
  createFakeNet,
  divingFishChart,
  lxnsEnvelope,
  lxnsScore,
  netRecord,
  postNetImport,
} from './server-import-fixtures'
import { cleanDatabase, getBaseUrl, setupTestServer, teardownTestServer } from './setup'

const SEGA_ID = 'synthetic-sega-id'
const PASSWORD = 'synthetic-password-1'
const FRIEND_CODE = '9012345678901'

let pool: pg.Pool
let email = 0

const newUser = async (options: { serverImports?: boolean } = {}) => {
  const user = await session(pool, `server-import-${++email}-${randomUUID().slice(0, 8)}@example.com`)
  if (options.serverImports === false) {
    await pool.query(
      `INSERT INTO feature_flag_overrides (flag, user_id, enabled, source) VALUES ('server_imports', $1, false, 'admin')`,
      [user.userId],
    )
  }
  const save = await api(user.cookie, 'POST', '/saves', { name: 'JP', region: 'jp' })
  expect(save.status).toBe(200)
  return { ...user, saveId: save.body.id as string }
}

const key = () => `test-${randomUUID()}`

const netBody = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: key(),
  trigger: 'user',
  region: 'jp',
  id: SEGA_ID,
  password: PASSWORD,
  ...overrides,
})

const records = async (saveId: string) =>
  (
    await pool.query(
      `SELECT sheet_id, achievement, combo_flag, sync_flag, dx_score, best50_bucket, source, fetched_by, verification,
         entry_method, source_account_id, import_job_id, raw_payload_sha256, fetched_at, revision
       FROM score_records WHERE save_id = $1 ORDER BY sheet_id`,
      [saveId],
    )
  ).rows

const jobRow = async (jobId: string) =>
  (await pool.query(`SELECT * FROM score_import_jobs WHERE id = $1`, [jobId])).rows[0]

const saveRevision = async (saveId: string) =>
  Number((await pool.query(`SELECT revision FROM score_saves WHERE id = $1`, [saveId])).rows[0].revision)

const eventCount = async (saveId: string) =>
  Number((await pool.query(`SELECT count(*) FROM score_record_events WHERE save_id = $1`, [saveId])).rows[0].count)

const NET_RECORDS = [
  netRecord(CHARTS.kiminoDxMaster, '100.5000%', ['fc', 'fs']),
  netRecord(CHARTS.kiminoStdMaster, '99.1234%'),
  netRecord(CHARTS.ourFightingStdBasic, '101.0000%', ['applus']),
  // not in the catalog
  { title: 'A song the catalog does not know', type: 'dx' as const, difficulty: 'master' as const, rate: '98.0000%' },
]

beforeAll(async () => {
  await setupTestServer()
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
})

afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

beforeEach(async () => {
  await cleanDatabase()
  upstream.net = undefined
  upstream.http = undefined
  upstream.httpCalls.length = 0
  catalogState.missingTitles.clear()
})

describe('maimai NET server import', () => {
  it('writes verified records straight into the save, with the friend code as source account', async () => {
    const user = await newUser()
    const net = createFakeNet({ id: SEGA_ID, password: PASSWORD, friendCode: FRIEND_CODE, records: NET_RECORDS })
    upstream.net = net.fetch

    const response = await postNetImport(user.cookie, user.saveId, netBody())
    expect(response.status).toBe(200)
    const states = response.events.filter((e) => e.event === 'progress').map((e) => e.data.state)
    expect(states).toEqual([
      'auth:in-progress',
      'auth:succeeded',
      'fetch:music:in-progress:basic',
      'fetch:music:in-progress:advanced',
      'fetch:music:in-progress:expert',
      'fetch:music:in-progress:master',
      'fetch:music:in-progress:remaster',
      'fetch:music:in-progress:utage',
      'fetch:music:completed',
      'concluded',
    ])
    const done = response.events.at(-1)!
    expect(done.event).toBe('done')
    expect(done.data.job).toMatchObject({
      source: 'maimai-net-jp',
      fetchedBy: 'server',
      trigger: 'user',
      status: 'succeeded',
      sourceAccountId: FRIEND_CODE,
      sourceAccountKind: 'friend_code',
      errorCode: null,
      counts: { fetched: 4, inserted: 3, skippedUnknownSheet: 1, rejected: 0 },
    })
    expect(done.data.revision).toBe(3)

    const job = await jobRow(done.data.job.id)
    expect(job.fetched_at).toBeInstanceOf(Date)
    expect(job.fetched_at.getTime()).toBeGreaterThanOrEqual(job.started_at.getTime())
    expect(job.raw_payload_sha256).toMatch(/^[0-9a-f]{64}$/)
    const stored = await records(user.saveId)
    expect(stored).toHaveLength(3)
    for (const record of stored) {
      expect(record).toMatchObject({
        source: 'maimai-net-jp',
        fetched_by: 'server',
        verification: 'verified',
        entry_method: 'import',
        source_account_id: FRIEND_CODE,
        import_job_id: job.id,
        raw_payload_sha256: job.raw_payload_sha256,
      })
      expect(record.fetched_at.getTime()).toBe(job.fetched_at.getTime())
    }
    expect(stored.find((r) => r.sheet_id === CHARTS.kiminoDxMaster.sheetId)).toMatchObject({
      achievement: 1005000,
      combo_flag: 'fc',
      sync_flag: 'fs',
      dx_score: 1234,
    })
    expect(stored.find((r) => r.sheet_id === CHARTS.ourFightingStdBasic.sheetId)).toMatchObject({
      achievement: 1010000,
      combo_flag: 'app',
    })
    // the recent page is not fetched, nor anything after the music pages
    expect(net.calls.filter((call) => call.includes('/record') && !call.includes('musicGenre'))).toEqual([])

    const pulled = await api(user.cookie, 'GET', `/saves/${user.saveId}/changes?since=0`)
    expect(pulled.body.records.map((r: any) => r.provenance.verification)).toEqual(['verified', 'verified', 'verified'])
  })

  it('falls back to a hash of the SEGA ID when the friend code page cannot be read', async () => {
    const user = await newUser()
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD, friendCode: null, records: NET_RECORDS }).fetch
    const response = await postNetImport(user.cookie, user.saveId, netBody({ region: 'intl' }))
    const done = response.events.at(-1)!
    expect(done.event).toBe('done')
    const expected = createHash('sha256').update(`intl:${SEGA_ID}`).digest('hex')
    expect(done.data.job).toMatchObject({
      source: 'maimai-net-intl',
      sourceAccountId: expected,
      sourceAccountKind: 'segaid_hash',
    })
    expect((await records(user.saveId)).every((r) => r.source_account_id === expected)).toBe(true)
  })

  it('is all or nothing: a difficulty page that still fails after the retries fails the job and writes nothing', async () => {
    const user = await newUser()
    await api(user.cookie, 'POST', `/saves/${user.saveId}/mutations`, {
      mutations: [
        {
          mutationId: '01890a5d-ac96-7a2b-8f00-000000000001',
          op: 'set',
          sheetId: sheetId(1),
          value: { achievement: 990000, comboFlag: null, syncFlag: null },
          entryMethod: 'typed',
        },
      ],
    })
    const revision = await saveRevision(user.saveId)
    const events = await eventCount(user.saveId)
    const net = createFakeNet({
      id: SEGA_ID,
      password: PASSWORD,
      friendCode: FRIEND_CODE,
      records: NET_RECORDS,
      failDifficulty: 3,
    })
    upstream.net = net.fetch

    const response = await postNetImport(user.cookie, user.saveId, netBody())
    const last = response.events.at(-1)!
    expect(last.event).toBe('error')
    expect(last.data).toMatchObject({ code: 'UPSTREAM_ERROR', jobId: expect.stringMatching(/^dimp_/) })
    // the #368 retry: the master page was asked three times
    expect(net.calls.filter((call) => call.includes('musicGenre'))).toHaveLength(3 + 3)
    const job = await jobRow(last.data.jobId)
    expect(job).toMatchObject({ status: 'failed', error_code: 'upstream_error' })
    expect(job.finished_at).toBeInstanceOf(Date)
    expect(await records(user.saveId)).toHaveLength(1)
    expect(await saveRevision(user.saveId)).toBe(revision)
    expect(await eventCount(user.saveId)).toBe(events)
  })

  it('fails on wrong credentials with a fixed message and no job writes', async () => {
    const user = await newUser()
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD }).fetch
    const response = await postNetImport(user.cookie, user.saveId, netBody({ password: 'wrong-password' }))
    const last = response.events.at(-1)!
    expect(last).toMatchObject({ event: 'error', data: { code: 'INVALID_CREDENTIALS' } })
    expect(await jobRow(last.data.jobId)).toMatchObject({ status: 'failed', error_code: 'invalid_credentials' })
    expect(await records(user.saveId)).toHaveLength(0)
  })

  it('answers 409 IMPORT_IN_PROGRESS with the running job, and replays an idempotency key', async () => {
    const user = await newUser()
    const running = await runDatabase((database) =>
      startImportJob(database, {
        userId: user.userId,
        saveId: user.saveId,
        source: 'maimai-net-jp',
        trigger: 'user',
        idempotencyKey: key(),
      }),
    )
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS }).fetch
    const conflict = await postNetImport(user.cookie, user.saveId, netBody())
    expect(conflict.status).toBe(409)
    expect(conflict.json).toMatchObject({
      code: 'CONFLICT',
      data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.job.id },
    })
    // another source of the same save is not blocked
    const intl = await postNetImport(user.cookie, user.saveId, netBody({ region: 'intl' }))
    expect(intl.events.at(-1)!.event).toBe('done')

    // replaying the intl key answers the same job without fetching again
    await pool.query(`UPDATE score_import_jobs SET status = 'failed' WHERE id = $1`, [running.job.id])
    const body = netBody({ region: 'jp' })
    const net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS })
    upstream.net = net.fetch
    const first = await postNetImport(user.cookie, user.saveId, body)
    const calls = net.calls.length
    const replay = await postNetImport(user.cookie, user.saveId, body)
    expect(replay.events).toEqual([{ event: 'done', data: first.events.at(-1)!.data }])
    expect(net.calls.length).toBe(calls)
  })

  it('short-circuits an automatic import of an unchanged payload', async () => {
    const user = await newUser()
    upstream.net = createFakeNet({
      id: SEGA_ID,
      password: PASSWORD,
      friendCode: FRIEND_CODE,
      records: NET_RECORDS,
    }).fetch
    const first = (await postNetImport(user.cookie, user.saveId, netBody({ trigger: 'auto' }))).events.at(-1)!
    expect(first.data.job.counts.inserted).toBe(3)
    const revision = await saveRevision(user.saveId)
    const events = await eventCount(user.saveId)

    const second = (await postNetImport(user.cookie, user.saveId, netBody({ trigger: 'auto' }))).events.at(-1)!
    expect(second.data.job).toMatchObject({
      status: 'succeeded',
      rawPayloadSha256: first.data.job.rawPayloadSha256,
      counts: { fetched: 4, unchanged: 3, inserted: 0, skippedUnknownSheet: 1 },
    })
    expect(await saveRevision(user.saveId)).toBe(revision)
    expect(await eventCount(user.saveId)).toBe(events)
    // the records still point at the first job: nothing was written
    expect((await records(user.saveId)).every((r) => r.import_job_id === first.data.job.id)).toBe(true)
  })

  it('validates the body without echoing it, and needs a session', async () => {
    const user = await newUser()
    const invalid = await postNetImport(user.cookie, user.saveId, netBody({ region: 'cn' }))
    expect(invalid.status).toBe(400)
    expect(invalid.text).not.toContain(PASSWORD)
    expect(invalid.text).not.toContain(SEGA_ID)
    const extra = await postNetImport(user.cookie, user.saveId, netBody({ verification: 'verified' }))
    expect(extra.status).toBe(400)
    const anonymous = await fetch(`${getBaseUrl()}/api/v1/saves/${user.saveId}/imports/maimai-net`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(netBody()),
    })
    expect(anonymous.status).toBe(401)
    const other = await newUser()
    expect((await postNetImport(other.cookie, user.saveId, netBody())).status).toBe(404)
  })

  it('limits each user to 6 NET imports an hour with 429 and Retry-After', async () => {
    const user = await newUser()
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD }).fetch
    for (let i = 0; i < 6; i++) {
      const response = await postNetImport(user.cookie, user.saveId, netBody({ password: 'wrong-password' }))
      expect(response.status).toBe(200)
    }
    const limited = await postNetImport(user.cookie, user.saveId, netBody({ password: 'wrong-password' }))
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(limited.json).toMatchObject({ code: 'TOO_MANY_REQUESTS', data: { retryAfterSeconds: expect.any(Number) } })
  })

  it('lets one NET import per user and four in total run at once, and gives busy requests their units back', async () => {
    const headers = { 'X-Forwarded-For': '198.51.100.10' }
    let open!: () => void
    const gate = new Promise<void>((resolve) => (open = resolve))
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS, gate }).fetch
    const users = [await newUser(), await newUser(), await newUser(), await newUser()]
    const running = users.map((user) => postNetImport(user.cookie, user.saveId, netBody(), { headers }))
    await expect.poll(() => runningNetImports()).toBe(NET_IMPORT_GLOBAL_CONCURRENCY)

    // the same user, another region: one NET import per user
    const sameUser = await postNetImport(users[0]!.cookie, users[0]!.saveId, netBody({ region: 'intl' }), { headers })
    expect(sameUser.status).toBe(429)
    expect(sameUser.headers.get('retry-after')).toBe('5')
    // a fifth user: four in total
    const fifth = await newUser()
    const global = await postNetImport(fifth.cookie, fifth.saveId, netBody(), { headers })
    expect(global.status).toBe(429)
    expect(global.headers.get('retry-after')).toBe('15')

    open()
    for (const response of await Promise.all(running)) expect(response.events.at(-1)!.event).toBe('done')
    expect(runningNetImports()).toBe(0)
    // the busy requests did no work: user 0 used one unit of 6, the fifth user none
    expect(cloudSaveRateLimits.netImports.take(users[0]!.userId, 5)).toBe(0)
    expect(cloudSaveRateLimits.netImports.take(fifth.userId, 6)).toBe(0)
  })

  it('runs a NET import to its end and frees its slots when the client leaves the stream', async () => {
    const user = await newUser()
    let open!: () => void
    const gate = new Promise<void>((resolve) => (open = resolve))
    const net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS, gate })
    upstream.net = net.fetch
    const client = new AbortController()
    const body = netBody()
    const request = postNetImport(user.cookie, user.saveId, body, {
      headers: { 'X-Forwarded-For': '198.51.100.11' },
      signal: client.signal,
    }).catch(() => null)
    await expect.poll(() => net.calls.some((call) => call.includes('/record/musicGenre/'))).toBe(true)
    expect(runningNetImports()).toBe(1)
    client.abort()
    await request
    open()
    await expect.poll(() => runningNetImports()).toBe(0)
    // the job ran to its end without the client
    await expect
      .poll(
        async () =>
          (await pool.query(`SELECT status FROM score_import_jobs WHERE idempotency_key = $1`, [body.idempotencyKey]))
            .rows[0]?.status,
      )
      .toBe('succeeded')
    expect(await records(user.saveId)).toHaveLength(3)
  })

  describe('when starting the job fails or is interrupted', () => {
    /** Makes the insert of the job with `idempotencyKey` sleep, then raise when `fail` */
    const sabotageJobInsert = async (idempotencyKey: string, options: { sleepSeconds?: number; fail?: boolean }) => {
      await pool.query(`
        CREATE OR REPLACE FUNCTION test_sabotage_job_insert() RETURNS trigger AS $$
        BEGIN
          IF NEW.idempotency_key = '${idempotencyKey}' THEN
            PERFORM pg_sleep(${options.sleepSeconds ?? 0});
            ${options.fail ? "RAISE EXCEPTION 'synthetic database failure';" : ''}
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`)
      await pool.query(`DROP TRIGGER IF EXISTS test_sabotage_job_insert ON score_import_jobs`)
      await pool.query(
        `CREATE TRIGGER test_sabotage_job_insert BEFORE INSERT ON score_import_jobs
         FOR EACH ROW EXECUTE FUNCTION test_sabotage_job_insert()`,
      )
    }
    afterEach(async () => {
      await pool.query(`DROP TRIGGER IF EXISTS test_sabotage_job_insert ON score_import_jobs`)
      await pool.query(`DROP FUNCTION IF EXISTS test_sabotage_job_insert()`)
    })

    it('gives the slots back when the job cannot be started, so the user can import again', async () => {
      const user = await newUser()
      const headers = { 'X-Forwarded-For': '198.51.100.13' }
      const body = netBody()
      await sabotageJobInsert(body.idempotencyKey, { fail: true })
      const failed = await postNetImport(user.cookie, user.saveId, body, { headers })
      expect(failed.status).toBe(500)
      expect(failed.text).not.toContain(PASSWORD)
      expect(runningNetImports()).toBe(0)

      upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS }).fetch
      const next = await postNetImport(user.cookie, user.saveId, netBody(), { headers })
      expect(next.status).toBe(200)
      expect(next.events.at(-1)!.event).toBe('done')
      expect(runningNetImports()).toBe(0)
    })

    it('gives the slots back and fails the job when the client leaves while the job starts', async () => {
      const user = await newUser()
      const headers = { 'X-Forwarded-For': '198.51.100.14' }
      const body = netBody()
      await sabotageJobInsert(body.idempotencyKey, { sleepSeconds: 0.6 })
      upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS }).fetch
      const client = new AbortController()
      const request = postNetImport(user.cookie, user.saveId, body, { headers, signal: client.signal }).catch(
        () => null,
      )
      await expect.poll(() => runningNetImports()).toBe(1)
      client.abort()
      await request
      await expect.poll(() => runningNetImports(), { timeout: 5000 }).toBe(0)
      await expect
        .poll(
          async () =>
            (
              await pool.query(`SELECT status, error_code FROM score_import_jobs WHERE idempotency_key = $1`, [
                body.idempotencyKey,
              ])
            ).rows[0],
          { timeout: 5000 },
        )
        .toMatchObject({ status: 'failed', error_code: 'interrupted' })
      expect(await records(user.saveId)).toHaveLength(0)

      const next = await postNetImport(user.cookie, user.saveId, netBody(), { headers })
      expect(next.events.at(-1)!.event).toBe('done')
    })
  })

  it('limits one address to 30 NET imports an hour', async () => {
    const headers = { 'X-Forwarded-For': '198.51.100.12' }
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD }).fetch
    for (let u = 0; u < 6; u++) {
      const user = await newUser()
      for (let i = 0; i < 5; i++) {
        const response = await postNetImport(user.cookie, user.saveId, netBody({ password: 'wrong-password' }), {
          headers,
        })
        expect(response.status).toBe(200)
      }
    }
    const user = await newUser()
    const limited = await postNetImport(user.cookie, user.saveId, netBody({ password: 'wrong-password' }), {
      headers,
    })
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    // another address is not limited
    expect(
      (
        await postNetImport(user.cookie, user.saveId, netBody({ password: 'wrong-password' }), {
          headers: { 'X-Forwarded-For': '198.51.100.13' },
        })
      ).status,
    ).toBe(200)
    // the user's own budget was given back when the address turned the request away: one unit of 6 used
    expect(cloudSaveRateLimits.netImports.take(user.userId, 5)).toBe(0)
  })

  it('imports the charts a lagging catalog skipped once it knows them, though the payload is unchanged', async () => {
    const user = await newUser()
    upstream.net = createFakeNet({
      id: SEGA_ID,
      password: PASSWORD,
      friendCode: FRIEND_CODE,
      records: NET_RECORDS,
    }).fetch
    catalogState.missingTitles.add(CHARTS.ourFightingStdBasic.title)
    const first = (await postNetImport(user.cookie, user.saveId, netBody({ trigger: 'auto' }))).events.at(-1)!
    expect(first.data.job.counts).toMatchObject({ inserted: 2, skippedUnknownSheet: 2 })

    // the catalog catches up: the same payload now resolves one more chart, so the job merges
    catalogState.missingTitles.clear()
    const second = (await postNetImport(user.cookie, user.saveId, netBody({ trigger: 'auto' }))).events.at(-1)!
    expect(second.data.job.rawPayloadSha256).toBe(first.data.job.rawPayloadSha256)
    expect(second.data.job.counts).toMatchObject({ inserted: 1, unchanged: 2, skippedUnknownSheet: 1 })
    expect((await records(user.saveId)).map((r) => r.sheet_id)).toContain(CHARTS.ourFightingStdBasic.sheetId)

    // and with nothing new resolved, the next one short-circuits again
    const revision = await saveRevision(user.saveId)
    const third = (await postNetImport(user.cookie, user.saveId, netBody({ trigger: 'auto' }))).events.at(-1)!
    expect(third.data.job.counts).toMatchObject({ inserted: 0, unchanged: 3, skippedUnknownSheet: 1 })
    expect(await saveRevision(user.saveId)).toBe(revision)
  })
})

describe('LXNS server import', () => {
  const seedToken = (userId: string, expiresAt: Date) =>
    pool.query(
      `INSERT INTO lxns_oauth_tokens (user_id, access_token, refresh_token, expires_at, scope)
       VALUES ($1, 'old-access', 'old-refresh', $2, 'read_user_profile read_player')`,
      [userId, expiresAt.toISOString()],
    )

  const scores = [lxnsScore(CHARTS.kiminoDxMaster, 100.5), lxnsScore(CHARTS.kiminoDxExpert, 97.12345)]

  const lxnsUpstream = (options: { accessToken: string; onRefresh?: (body: any) => void }) => {
    upstream.http = async (url, init) => {
      if (url.href === 'https://maimai.lxns.net/api/v0/oauth/token') {
        options.onRefresh?.(await new Response(init?.body).json())
        return lxnsEnvelope({
          access_token: options.accessToken,
          refresh_token: 'new-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read_user_profile read_player',
        })
      }
      const authorization = new Headers(init?.headers).get('authorization')
      if (authorization !== `Bearer ${options.accessToken}`) return new Response('unauthorized', { status: 401 })
      if (url.pathname === '/api/v0/user/maimai/player') return lxnsEnvelope({ name: 'SYNTH', friend_code: 123456789 })
      if (url.pathname === '/api/v0/user/maimai/player/scores') return lxnsEnvelope(scores)
      return undefined
    }
  }

  it('refreshes an expired token, then imports verified records with the LXNS friend code', async () => {
    const user = await newUser()
    await seedToken(user.userId, new Date(Date.now() - 60_000))
    let refreshed: any
    lxnsUpstream({ accessToken: 'new-access', onRefresh: (body) => (refreshed = body) })

    const response = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
      idempotencyKey: key(),
      trigger: 'user',
    })
    expect(response.status).toBe(200)
    expect(refreshed).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'old-refresh' })
    expect(
      (await pool.query(`SELECT access_token, refresh_token FROM lxns_oauth_tokens WHERE user_id = $1`, [user.userId]))
        .rows[0],
    ).toEqual({ access_token: 'new-access', refresh_token: 'new-refresh' })
    expect(response.body.job).toMatchObject({
      source: 'lxns',
      status: 'succeeded',
      sourceAccountId: '123456789',
      sourceAccountKind: 'lxns_friend_code',
      rawPayloadSha256: canonicalSha256(scores),
      counts: { fetched: 2, inserted: 2 },
    })
    const stored = await records(user.saveId)
    expect(stored.map((r) => [r.sheet_id, r.achievement, r.verification, r.source_account_id])).toEqual(
      [
        [CHARTS.kiminoDxExpert.sheetId, 971234, 'verified', '123456789'],
        [CHARTS.kiminoDxMaster.sheetId, 1005000, 'verified', '123456789'],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    )
  })

  it('takes the player and the scores from one connection when the user reconnects meanwhile', async () => {
    const user = await newUser()
    await seedToken(user.userId, new Date(Date.now() + 3_600_000))
    const authorizations: (string | null)[] = []
    upstream.http = async (url, init) => {
      const authorization = new Headers(init?.headers).get('authorization')
      authorizations.push(authorization)
      if (url.pathname === '/api/v0/user/maimai/player') {
        // The user connects another LXNS account while the player request is answered
        await pool.query(`UPDATE lxns_oauth_tokens SET access_token = 'account-b' WHERE user_id = $1`, [user.userId])
        return lxnsEnvelope({ name: 'SYNTH', friend_code: 123456789 })
      }
      if (url.pathname === '/api/v0/user/maimai/player/scores') {
        return authorization === 'Bearer old-access'
          ? lxnsEnvelope(scores)
          : lxnsEnvelope([lxnsScore(CHARTS.ourFightingStdBasic, 80)])
      }
      return undefined
    }
    const response = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
      idempotencyKey: key(),
      trigger: 'user',
    })
    expect(response.body.job).toMatchObject({ status: 'succeeded', sourceAccountId: '123456789' })
    expect(authorizations).toEqual(['Bearer old-access', 'Bearer old-access'])
    expect((await records(user.saveId)).map((r) => r.sheet_id).sort()).toEqual(
      [CHARTS.kiminoDxMaster.sheetId, CHARTS.kiminoDxExpert.sheetId].sort(),
    )
  })

  it('fails the job without a connection', async () => {
    const user = await newUser()
    const response = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
      idempotencyKey: key(),
      trigger: 'auto',
    })
    expect(response.status).toBe(200)
    expect(response.body.job).toMatchObject({ status: 'failed', errorCode: 'not_connected' })
    expect(await records(user.saveId)).toHaveLength(0)
    expect(upstream.httpCalls).toEqual([])
  })

  it('answers 409 while a job of the source runs, and replays the key', async () => {
    const user = await newUser()
    await seedToken(user.userId, new Date(Date.now() + 3_600_000))
    lxnsUpstream({ accessToken: 'old-access' })
    const body = { idempotencyKey: key(), trigger: 'user' }
    const first = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, body)
    const calls = upstream.httpCalls.length
    const replay = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, body)
    expect(replay.body.job).toEqual(first.body.job)
    expect(upstream.httpCalls.length).toBe(calls)

    const running = await runDatabase((database) =>
      startImportJob(database, {
        userId: user.userId,
        saveId: user.saveId,
        source: 'lxns',
        trigger: 'user',
        idempotencyKey: key(),
      }),
    )
    const conflict = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
      idempotencyKey: key(),
      trigger: 'user',
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body).toMatchObject({ data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.job.id } })
  })

  it('fails a job left running for 15 minutes instead of answering 409 forever', async () => {
    const user = await newUser()
    await seedToken(user.userId, new Date(Date.now() + 3_600_000))
    lxnsUpstream({ accessToken: 'old-access' })
    const stale = await runDatabase((database) =>
      startImportJob(database, {
        userId: user.userId,
        saveId: user.saveId,
        source: 'lxns',
        trigger: 'user',
        idempotencyKey: key(),
      }),
    )
    await pool.query(`UPDATE score_import_jobs SET started_at = now() - interval '16 minutes' WHERE id = $1`, [
      stale.job.id,
    ])
    const response = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
      idempotencyKey: key(),
      trigger: 'user',
    })
    expect(response.body.job.status).toBe('succeeded')
    expect(await jobRow(stale.job.id)).toMatchObject({ status: 'failed', error_code: 'abandoned' })
  })

  it('gives the rate limit unit back on replays and on 409 IMPORT_IN_PROGRESS', async () => {
    const user = await newUser()
    await seedToken(user.userId, new Date(Date.now() + 3_600_000))
    lxnsUpstream({ accessToken: 'old-access' })
    const body = { idempotencyKey: key(), trigger: 'user' }
    expect((await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, body)).status).toBe(200)
    for (let i = 0; i < 12; i++) {
      expect((await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, body)).status).toBe(200)
    }
    await runDatabase((database) =>
      startImportJob(database, {
        userId: user.userId,
        saveId: user.saveId,
        source: 'lxns',
        trigger: 'auto',
        idempotencyKey: key(),
      }),
    )
    for (let i = 0; i < 12; i++) {
      const conflict = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
        idempotencyKey: key(),
        trigger: 'auto',
      })
      expect(conflict.status).toBe(409)
    }
    // one unit of 12 used: the first import
    expect(cloudSaveRateLimits.serverImports.take(user.userId, 11)).toBe(0)
  })

  it('lets one user run one LXNS or Diving-Fish import at a time', async () => {
    const user = await newUser()
    await seedToken(user.userId, new Date(Date.now() + 3_600_000))
    let open!: () => void
    const gate = new Promise<void>((resolve) => (open = resolve))
    lxnsUpstream({ accessToken: 'old-access' })
    const lxns = upstream.http!
    upstream.http = async (url, init) => {
      if (url.pathname === '/api/v0/user/maimai/player/scores') await gate
      if (url.hostname === 'www.diving-fish.com') return Response.json({ message: 'user not exists' }, { status: 400 })
      return lxns(url, init)
    }
    const stalled = api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
      idempotencyKey: key(),
      trigger: 'user',
    })
    await expect.poll(() => upstream.httpCalls.some((call) => call.includes('/player/scores'))).toBe(true)
    const divingFish = () =>
      api(user.cookie, 'POST', `/saves/${user.saveId}/imports/diving-fish`, {
        idempotencyKey: key(),
        trigger: 'user',
        username: 'synth',
      })
    const busy = await divingFish()
    expect(busy.status).toBe(429)
    expect(busy.headers.get('retry-after')).toBeTruthy()
    open()
    expect((await stalled).body.job.status).toBe('succeeded')
    // the slot is free again
    expect((await divingFish()).status).toBe(200)
    // the busy request gave its unit back: two of 12 used
    expect(cloudSaveRateLimits.serverImports.take(user.userId, 10)).toBe(0)
  })
})

describe('Diving-Fish server import', () => {
  it('imports the public B50 as verified records and keeps each best 50 bucket', async () => {
    const user = await newUser()
    let requested: any
    const charts = {
      dx: [divingFishChart(CHARTS.kiminoDxMaster, 100.6)],
      sd: [divingFishChart(CHARTS.kiminoStdMaster, 99.5), divingFishChart(CHARTS.ourFightingStdBasic, 98)],
    }
    upstream.http = async (url, init) => {
      if (url.href !== 'https://www.diving-fish.com/api/maimaidxprober/query/player') return undefined
      requested = await new Response(init?.body).json()
      return Response.json({ nickname: 'SYNTH', rating: 12345, username: 'synth', charts })
    }
    const response = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/diving-fish`, {
      idempotencyKey: key(),
      trigger: 'user',
      username: 'synth',
    })
    expect(response.status).toBe(200)
    expect(requested).toEqual({ b50: 1, username: 'synth' })
    expect(response.body.job).toMatchObject({
      source: 'diving-fish',
      status: 'succeeded',
      sourceAccountId: 'synth',
      sourceAccountKind: 'df_username',
      rawPayloadSha256: canonicalSha256(charts),
      counts: { fetched: 3, inserted: 3 },
    })
    const stored = await records(user.saveId)
    const bucketOf = (sheet: string) => stored.find((r) => r.sheet_id === sheet)?.best50_bucket
    expect(bucketOf(CHARTS.kiminoDxMaster.sheetId)).toBe('b15')
    expect(bucketOf(CHARTS.kiminoStdMaster.sheetId)).toBe('b35')
    expect(bucketOf(CHARTS.ourFightingStdBasic.sheetId)).toBe('b35')
    expect(stored.every((r) => r.verification === 'verified' && r.fetched_by === 'server')).toBe(true)
  })

  it('leaves out masked rows (no DX score), so a later exact import is not stuck below a rounded-up score', async () => {
    const user = await newUser()
    let charts: { dx: unknown[]; sd: unknown[] } = {
      // The score mask: an AP at 100.6% comes back as 101% without a DX score
      dx: [{ ...divingFishChart(CHARTS.kiminoDxMaster, 101), fc: 'ap', dxScore: 0 }],
      sd: [],
    }
    upstream.http = async (url) =>
      url.href === 'https://www.diving-fish.com/api/maimaidxprober/query/player'
        ? Response.json({ nickname: 'SYNTH', rating: 12345, username: 'synth', charts })
        : undefined
    const run = () =>
      api(user.cookie, 'POST', `/saves/${user.saveId}/imports/diving-fish`, {
        idempotencyKey: key(),
        trigger: 'user',
        username: 'synth',
      })

    const masked = await run()
    expect(masked.body.job).toMatchObject({ status: 'succeeded', counts: { fetched: 1, inserted: 0, rejected: 1 } })
    expect(await records(user.saveId)).toHaveLength(0)

    // Unmasked, the exact score is stored
    charts = { dx: [{ ...divingFishChart(CHARTS.kiminoDxMaster, 100.6), fc: 'ap' }], sd: [] }
    const exact = await run()
    expect(exact.body.job).toMatchObject({ status: 'succeeded', counts: { inserted: 1 } })
    expect((await records(user.saveId)).map((r) => [r.achievement, r.dx_score])).toEqual([[1006000, 1500]])
  })

  it('queries by QQ and fails the job for an unknown player', async () => {
    const user = await newUser()
    let requested: any
    upstream.http = async (_url, init) => {
      requested = await new Response(init?.body).json()
      return Response.json({ message: 'user not exists' }, { status: 400 })
    }
    const response = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/diving-fish`, {
      idempotencyKey: key(),
      trigger: 'user',
      qq: '123456789',
    })
    expect(requested).toEqual({ b50: 1, qq: '123456789' })
    expect(response.body.job).toMatchObject({ status: 'failed', errorCode: 'not_found', sourceAccountKind: null })
    expect(await records(user.saveId)).toHaveLength(0)
  })

  it('limits LXNS and Diving-Fish imports to 12 an hour per user', async () => {
    const user = await newUser()
    upstream.http = () => Response.json({}, { status: 400 })
    const call = () =>
      api(user.cookie, 'POST', `/saves/${user.saveId}/imports/diving-fish`, {
        idempotencyKey: key(),
        trigger: 'user',
        username: 'synth',
      })
    for (let i = 0; i < 12; i++) expect((await call()).status).toBe(200)
    const limited = await call()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
  })
})

describe('server import flags and provenance', () => {
  it('fails a started job that an interruption kept from running, and leaves a finished one alone', async () => {
    const user = await newUser()
    const start = (source: 'lxns' | 'diving-fish') =>
      runDatabase((database) =>
        beginServerImport(database, {
          userId: user.userId,
          saveId: user.saveId,
          source,
          trigger: 'user',
          idempotencyKey: key(),
        }),
      )
    // interrupted between the job row and the hand-over
    const interrupted = await start('lxns')
    const exit = await runDatabase((database) =>
      Effect.exit(Effect.interrupt.pipe(Effect.onInterrupt(() => failInterruptedImport(database, interrupted.job.id)))),
    )
    expect(Exit.hasInterrupts(exit)).toBe(true)
    expect(await jobRow(interrupted.job.id)).toMatchObject({ status: 'failed', error_code: 'interrupted' })
    // the source is free again: no 409 for 15 minutes
    expect((await start('lxns')).replayed).toBe(false)

    const finished = await start('diving-fish')
    await pool.query(`UPDATE score_import_jobs SET status = 'succeeded' WHERE id = $1`, [finished.job.id])
    await runDatabase((database) => failInterruptedImport(database, finished.job.id))
    expect(await jobRow(finished.job.id)).toMatchObject({ status: 'succeeded', error_code: null })
  })

  it('answers busy within the lock timeout when another writer holds the save, before any upstream fetch', async () => {
    const user = await newUser()
    const holder = await pool.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT id FROM score_saves WHERE id = $1 FOR UPDATE`, [user.saveId])

      const startedAt = Date.now()
      const exit = await appRuntime.runPromiseExit(
        Effect.flatMap(Database, (database) =>
          beginServerImport(database, {
            userId: user.userId,
            saveId: user.saveId,
            source: 'lxns',
            trigger: 'user',
            idempotencyKey: key(),
          }),
        ),
      )
      const elapsed = Date.now() - startedAt
      expect(Option.getOrUndefined(Exit.findErrorOption(exit))).toBeInstanceOf(CloudSaveBusy)
      expect(elapsed).toBeGreaterThanOrEqual(SAVE_LOCK_TIMEOUT_MS - 500)
      expect(elapsed).toBeLessThan(SAVE_LOCK_TIMEOUT_MS + 3000)

      // the NET route answers 429 with Retry-After, gives its slots back and fetches nothing
      let netCalls = 0
      const fake = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS }).fetch
      upstream.net = (url, init) => {
        netCalls += 1
        return fake(url, init)
      }
      const busy = await postNetImport(user.cookie, user.saveId, netBody(), {
        headers: { 'X-Forwarded-For': '198.51.100.21' },
      })
      expect(busy.status).toBe(429)
      expect(busy.headers.get('retry-after')).toBe('1')
      expect(busy.json).toMatchObject({ code: 'TOO_MANY_REQUESTS' })
      expect(netCalls).toBe(0)
      expect(runningNetImports()).toBe(0)
    } finally {
      await holder.query('ROLLBACK')
      holder.release()
    }
    expect((await pool.query(`SELECT count(*)::integer AS n FROM score_import_jobs`)).rows[0].n).toBe(0)
  })

  it('fails a running job as interrupted when the runner is aborted from outside', async () => {
    const user = await newUser()
    const started = await runDatabase((database) =>
      beginServerImport(database, {
        userId: user.userId,
        saveId: user.saveId,
        source: 'lxns',
        trigger: 'user',
        idempotencyKey: key(),
      }),
    )
    let signalEntered = () => {}
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve
    })
    const fetch: Effect.Effect<UpstreamFetch> = Effect.sync(() => signalEntered()).pipe(Effect.andThen(Effect.never))
    const abort = new AbortController()
    const run = appRuntime.runPromiseExit(
      Effect.flatMap(Database, (database) => runServerImport(database, started, fetch, { timeout: '1 minute' })),
      { signal: abort.signal },
    )
    await entered
    expect(await jobRow(started.job.id)).toMatchObject({ status: 'running' })
    abort.abort()
    const exit = await run
    expect(Exit.hasInterrupts(exit)).toBe(true)
    expect(await jobRow(started.job.id)).toMatchObject({ status: 'failed', error_code: 'interrupted' })
    expect(await records(user.saveId)).toHaveLength(0)
  })

  it('refuses an idempotency key that already names an import of another source or save', async () => {
    const user = await newUser()
    const other = await api(user.cookie, 'POST', '/saves', { name: 'Other', region: 'jp' })
    upstream.http = (url) =>
      url.hostname === 'www.diving-fish.com'
        ? Response.json({ nickname: 'SYNTH', rating: 1, username: 'synth', charts: { dx: [], sd: [] } })
        : undefined
    const reused = key()
    const first = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/diving-fish`, {
      idempotencyKey: reused,
      trigger: 'user',
      username: 'synth',
    })
    expect(first.status).toBe(200)
    const calls = upstream.httpCalls.length
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS }).fetch

    const lxns = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
      idempotencyKey: reused,
      trigger: 'user',
    })
    expect(lxns.status).toBe(400)
    const net = await postNetImport(user.cookie, user.saveId, netBody({ idempotencyKey: reused }), {
      headers: { 'X-Forwarded-For': '198.51.100.14' },
    })
    expect(net.status).toBe(400)
    expect(net.json).toMatchObject({ code: 'BAD_REQUEST' })
    const otherSave = await api(user.cookie, 'POST', `/saves/${other.body.id}/imports/diving-fish`, {
      idempotencyKey: reused,
      trigger: 'user',
      username: 'synth',
    })
    expect(otherSave.status).toBe(400)
    // nothing was fetched, and the same source and save still replays
    expect(upstream.httpCalls.length).toBe(calls)
    const replay = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/diving-fish`, {
      idempotencyKey: reused,
      trigger: 'user',
      username: 'synth',
    })
    expect(replay.body.job).toEqual(first.body.job)
    expect((await pool.query(`SELECT count(*)::integer AS n FROM score_import_jobs`)).rows[0].n).toBe(1)
  })
  it('answers 404 on the three server import routes while server imports are off for the user', async () => {
    const user = await newUser({ serverImports: false })
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS }).fetch
    expect((await postNetImport(user.cookie, user.saveId, netBody())).status).toBe(404)
    for (const [path, body] of [
      ['lxns', { idempotencyKey: key(), trigger: 'user' }],
      ['diving-fish', { idempotencyKey: key(), trigger: 'user', username: 'synth' }],
    ] as const) {
      const response = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/${path}`, body)
      expect(response.status, path).toBe(404)
    }
    expect(upstream.httpCalls).toEqual([])
    // the legacy paths keep working, and client imports stay available (client_reported)
    const legacy = await fetch(`${getBaseUrl()}/functions/fetch-net-records/v0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: SEGA_ID, password: PASSWORD, region: 'jp' }),
    })
    expect(legacy.status).toBe(200)
    expect((await legacy.json()).musicRecords).toHaveLength(NET_RECORDS.length)
    const client = await api(user.cookie, 'POST', `/saves/${user.saveId}/client-imports`, {
      idempotencyKey: key(),
      source: 'dxrating-json',
      trigger: 'user',
      records: [{ sheetId: CHARTS.kiminoDxMaster.sheetId, achievement: 1005000, comboFlag: null, syncFlag: null }],
    })
    expect(client.status).toBe(200)
    expect((await records(user.saveId))[0]).toMatchObject({ verification: 'client_reported', fetched_by: 'client' })
  })

  it('marks records verified only from server jobs: a client upload of the same chart stays client_reported', async () => {
    const user = await newUser()
    const client = await api(user.cookie, 'POST', `/saves/${user.saveId}/client-imports`, {
      idempotencyKey: key(),
      source: 'dxrating-json',
      trigger: 'user',
      records: [
        {
          sheetId: CHARTS.kiminoDxMaster.sheetId,
          achievement: 1009000,
          comboFlag: 'ap',
          syncFlag: null,
          claimedSource: 'maimai-net',
        },
      ],
    })
    expect(client.body.job).toMatchObject({ fetchedBy: 'client', status: 'succeeded' })
    upstream.net = createFakeNet({ id: SEGA_ID, password: PASSWORD, records: NET_RECORDS }).fetch
    await postNetImport(user.cookie, user.saveId, netBody())
    const stored = await records(user.saveId)
    // the better client value is kept, unverified; the charts only the server fetched are verified
    expect(stored.find((r) => r.sheet_id === CHARTS.kiminoDxMaster.sheetId)).toMatchObject({
      achievement: 1009000,
      verification: 'client_reported',
      source: 'dxrating-json',
    })
    expect(stored.filter((r) => r.verification === 'verified')).toHaveLength(2)
    expect(stored.filter((r) => r.verification === 'verified').every((r) => r.fetched_by === 'server')).toBe(true)
  })

  it('keeps the server import routes out of the public spec', async () => {
    const spec = JSON.stringify(await (await fetch(`${getBaseUrl()}/spec.json`)).json())
    expect(spec).not.toMatch(/\/saves|imports\/lxns|imports\/diving-fish|client-imports|\/imports\//)
  })
})