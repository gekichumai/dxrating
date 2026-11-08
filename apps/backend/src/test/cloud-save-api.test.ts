import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// config.ts reads the environment once, at import: cloud save is on only for users with a flag row.
vi.hoisted(() => {
  process.env.CLOUD_SAVE_MODE = 'allowlist'
  process.env.CLOUD_SAVE_ALLOWLIST_EMAILS = ''
})

import { runCloudSaveCleanup } from '../services/cloud-save/cleanup'
import { canonicalSha256 } from '../services/cloud-save/jobs'
import { EXPORT_CONCURRENCY, exportChunks, tryAcquireExportSlot } from '../services/cloud-save/export'
import { appRuntime } from '../runtime'
import { Effect } from 'effect'
import { CLOUD_SAVE_EXPECTED_USER_HEADER } from '@gekichumai/api-contract'
import { CLOUD_SAVE_LARGE_BODY_LIMIT_BYTES, CLOUD_SAVE_MAX_RECORDS_PER_SAVE } from '../services/cloud-save/limits'
import {
  api,
  deleteMutation,
  importRecords,
  runDatabase,
  session,
  setMutation,
  sheetId,
  testPool,
  uuidv7,
} from './cloud-save-helpers'
import { authenticatedFetch, cleanDatabase, getBaseUrl, setupTestServer, teardownTestServer } from './setup'

const pool = testPool()

const newSave = async (cookie: string, body: Record<string, unknown> = {}) => {
  const response = await api(cookie, 'POST', '/saves', { name: 'JP main', region: 'jp', ...body })
  expect(response.status).toBe(200)
  return response.body as { id: string; revision: number }
}

const mutate = (cookie: string, saveId: string, mutations: unknown[]) =>
  api(cookie, 'POST', `/saves/${saveId}/mutations`, { mutations })

const record = async (saveId: string, sheet: string) =>
  (
    await pool.query(
      `SELECT achievement, verification, source, fetched_by, revision::integer AS revision, deleted_at,
              edited_from_job_id, import_job_id
       FROM score_records WHERE save_id = $1 AND sheet_id = $2`,
      [saveId, sheet],
    )
  ).rows[0]

describe('cloud save API (design §5)', () => {
  beforeAll(async () => {
    await setupTestServer()
    await cleanDatabase()
  })
  afterAll(async () => {
    await teardownTestServer()
    await pool.end()
  })

  describe('gates', () => {
    it('answers 401 without a session and 404 while the flag is off, on every route', async () => {
      const off = await session(pool, 'flag-off@example.com', { cloudSave: false })
      const routes: Array<[string, string, unknown?]> = [
        ['GET', '/saves'],
        ['POST', '/saves', { name: 'x', region: 'jp' }],
        ['PATCH', '/saves/dsav_x', { name: 'y' }],
        ['DELETE', '/saves/dsav_x'],
        ['GET', '/saves/dsav_x/changes?since=0'],
        ['POST', '/saves/dsav_x/mutations', { mutations: [setMutation(sheetId(1), 1000000)] }],
        ['GET', `/saves/dsav_x/records/${sheetId(1)}/events`],
        [
          'POST',
          '/saves/dsav_x/replace',
          { ifRevision: 0, idempotencyKey: 'replace-0001', source: 'dxrating-json', records: [] },
        ],
        [
          'POST',
          '/saves/dsav_x/snapshots',
          { atRevision: 0, b15Sum: 0, b35Sum: 0, b50Sum: 0, recordCount: 0, gameVersion: 'prism' },
        ],
        ['GET', '/saves/dsav_x/snapshots'],
        ['GET', '/saves/dsav_x/imports'],
        ['GET', '/imports/dimp_x'],
        ['GET', '/me/export'],
      ]
      for (const [method, path, body] of routes) {
        expect((await api(null, method, path, body)).status, `${method} ${path} anonymous`).toBe(401)
        const response = await api(off.cookie, method, path, body)
        expect(response.status, `${method} ${path} flag off`).toBe(404)
        expect(response.body).toMatchObject({ code: 'NOT_FOUND', status: 404 })
      }
    })

    it('keeps every cloud save path out of the public spec, the API catalog and the guides', async () => {
      const spec = await (await fetch(`${getBaseUrl()}/spec.json`)).json()
      const paths = Object.keys(spec.paths)
      expect(paths.length).toBeGreaterThan(5)
      for (const path of paths) {
        expect(path).not.toMatch(/^\/(saves|imports|me\/export|me\/features)(\/|$)/)
      }
      expect(JSON.stringify(spec)).not.toMatch(/cloud-save|cloudSave|\/saves|client-imports|me\/export/)

      const catalog = await (await fetch(`${getBaseUrl()}/.well-known/api-catalog`)).text()
      expect(catalog).not.toMatch(/saves|imports|export|features/)
      for (const path of ['/llms.txt', '/index.md', '/']) {
        const guide = await fetch(`${getBaseUrl()}${path}`, { headers: { 'X-Forwarded-Host': 'mcp.dxrating.net' } })
        const text = await guide.text()
        expect(guide.status, path).toBe(200)
        expect(text, path).toContain('/mcp')
        expect(text, path).not.toMatch(/\/saves|client-imports|me\/export|cloud save/i)
      }
    })

    it('limits each user per route with 429 and Retry-After', async () => {
      const user = await session(pool, 'limited@example.com')
      const other = await session(pool, 'unlimited@example.com')
      // POST /saves: 20 a day; replays of the same profile key count too
      for (let i = 0; i < 20; i++) {
        const response = await api(user.cookie, 'POST', '/saves', {
          name: 'Web',
          region: 'jp',
          clientProfileKey: 'web-local',
        })
        expect(response.status).toBe(200)
      }
      const limited = await api(user.cookie, 'POST', '/saves', {
        name: 'Web',
        region: 'jp',
        clientProfileKey: 'web-local',
      })
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
      expect(limited.body).toMatchObject({ code: 'TOO_MANY_REQUESTS', data: { retryAfterSeconds: expect.any(Number) } })
      expect((await api(other.cookie, 'POST', '/saves', { name: 'Web', region: 'jp' })).status).toBe(200)

      // export: 5 a day, on the streaming route
      for (let i = 0; i < 5; i++) expect((await api(other.cookie, 'GET', '/me/export')).status).toBe(200)
      const exportLimited = await api(other.cookie, 'GET', '/me/export')
      expect(exportLimited.status).toBe(429)
      expect(exportLimited.headers.get('retry-after')).toBeTruthy()
    })

    it('rejects bodies over 1 MB (2 MB for replace)', async () => {
      const user = await session(pool, 'body@example.com')
      const save = await newSave(user.cookie)
      const big = { mutations: [{ ...setMutation(sheetId(1), 1000000), padding: 'x'.repeat(1_100_000) }] }
      expect((await mutate(user.cookie, save.id, big.mutations)).status).toBe(413)
      const records = Array.from({ length: 10_000 }, (_, i) => ({
        sheetId: sheetId(i),
        achievement: 1000000,
        comboFlag: null,
        syncFlag: null,
        claimedSource: 'x'.repeat(60),
      }))
      const replace = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, {
        ifRevision: 0,
        idempotencyKey: 'replace-body-1',
        source: 'dxrating-json',
        records,
      })
      // ~1.5 MB: accepted by the 2 MB limit
      expect(replace.status).toBe(200)
      // over 2 MB: refused on both large-upload routes
      const huge = records.map((r) => ({ ...r, claimedSource: 'x'.repeat(200) }))
      const tooBig = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, {
        ifRevision: 10_000,
        idempotencyKey: 'replace-body-2',
        source: 'dxrating-json',
        records: huge,
      })
      expect(tooBig.status).toBe(413)
      const importTooBig = await api(user.cookie, 'POST', `/saves/${save.id}/client-imports`, {
        idempotencyKey: 'import-body-1',
        source: 'dxrating-json',
        trigger: 'user',
        records: huge,
      })
      expect(importTooBig.status).toBe(413)
    })

    it('refuses a deeply nested snapshot detail with 400 before any middleware, never a 500', async () => {
      const off = await session(pool, 'nested-off@example.com', { cloudSave: false })
      const on = await session(pool, 'nested-on@example.com')
      const save = await newSave(on.cookie)
      const depth = 200_000
      const body = `{"atRevision":0,"b15Sum":0,"b35Sum":0,"b50Sum":0,"recordCount":0,"gameVersion":"prism","detail":{"a":${'['.repeat(depth)}1${']'.repeat(depth)}}}`
      for (const cookie of [null, off.cookie, on.cookie]) {
        const response = await api(cookie, 'POST', `/saves/${save.id}/snapshots`, body)
        expect([400, 401, 404], String(response.status)).toContain(response.status)
      }
      const oversized = await api(on.cookie, 'POST', `/saves/${save.id}/snapshots`, {
        atRevision: 0,
        b15Sum: 0,
        b35Sum: 0,
        b50Sum: 0,
        recordCount: 0,
        gameVersion: 'prism',
        detail: { a: 'x'.repeat(40_000) },
      })
      expect(oversized.status).toBe(400)
    })

    it('rejects U+0000, lone surrogates and out-of-range counts with a validation error, never a 500', async () => {
      const user = await session(pool, 'nul@example.com')
      const save = await newSave(user.cookie)
      const replaced = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, {
        ifRevision: 0,
        idempotencyKey: 'replace-nul-1',
        source: 'dxrating-json',
        records: [
          { sheetId: sheetId(1), achievement: 1000000, comboFlag: null, syncFlag: null, providerRecordId: 'a\u0000b' },
          { sheetId: sheetId(2), achievement: 1005000, comboFlag: null, syncFlag: null },
          { sheetId: sheetId(3), achievement: 1000000, comboFlag: null, syncFlag: null, providerRecordId: '\ud800' },
        ],
      })
      // the NUL and lone-surrogate records alone are rejected; their valid sibling commits
      expect(replaced.status).toBe(200)
      expect(replaced.body.job.counts).toMatchObject({ inserted: 1, rejected: 2 })
      expect(await record(save.id, sheetId(1))).toBeUndefined()
      expect(await record(save.id, sheetId(3))).toBeUndefined()
      expect(await record(save.id, sheetId(2))).toMatchObject({ achievement: 1005000, deleted_at: null })

      const snapshot = (detail: unknown) =>
        api(user.cookie, 'POST', `/saves/${save.id}/snapshots`, {
          atRevision: 0,
          b15Sum: 0,
          b35Sum: 0,
          b50Sum: 0,
          recordCount: 0,
          gameVersion: 'prism',
          detail,
        })
      expect((await snapshot({ a: '\u0000' })).status).toBe(400)
      expect((await snapshot({ 'a\u0000': 1 })).status).toBe(400)
      expect((await snapshot({ a: ['ok', { b: 'x\u0000' }] })).status).toBe(400)
      // an unpaired surrogate is refused the same way, a paired one is fine
      expect((await snapshot({ a: '\ud800' })).status).toBe(400)
      expect((await snapshot({ a: '\ud83c\udfb5' })).status).toBe(200)
      // counts beyond the integer columns are a 400 too
      const huge = await api(user.cookie, 'POST', `/saves/${save.id}/snapshots`, {
        atRevision: 0,
        b15Sum: 2_147_483_648,
        b35Sum: 0,
        b50Sum: 0,
        recordCount: 0,
        gameVersion: 'prism',
      })
      expect(huge.status).toBe(400)
      expect((await api(user.cookie, 'POST', '/saves', { name: 'JP\u0000', region: 'jp' })).status).toBe(400)
      expect((await api(user.cookie, 'PATCH', `/saves/${save.id}`, { name: 'JP\u0000' })).status).toBe(400)
    })

    it('bounds lock waits and concurrent writes per user with a retryable 429', async () => {
      const user = await session(pool, 'busy@example.com')
      const other = await session(pool, 'not-busy@example.com')
      const save = await newSave(user.cookie)
      const holder = await pool.connect()
      try {
        await holder.query('BEGIN')
        await holder.query('SELECT 1 FROM score_saves WHERE id = $1 FOR UPDATE', [save.id])
        const startedAt = Date.now()
        const writes = Array.from({ length: 4 }, (_, i) =>
          mutate(user.cookie, save.id, [setMutation(sheetId(i), 1000000)]),
        )
        // other users are served while this one's writers wait
        const elsewhere = await api(other.cookie, 'GET', '/saves')
        expect(elsewhere.status).toBe(200)
        expect(Date.now() - startedAt).toBeLessThan(3000)
        const answers = await Promise.all(writes)
        expect(answers.map((answer) => answer.status)).toEqual([429, 429, 429, 429])
        for (const answer of answers) {
          expect(answer.body).toMatchObject({ code: 'TOO_MANY_REQUESTS', data: { retryAfterSeconds: 1 } })
          expect(answer.headers.get('retry-after')).toBe('1')
        }
        await holder.query('ROLLBACK')
      } finally {
        await holder.query('ROLLBACK')
        holder.release()
      }
      const after = await mutate(user.cookie, save.id, [setMutation(sheetId(1), 1000000)])
      expect(after.status).toBe(200)
      expect(after.body.results[0].status).toBe('applied')
    }, 20_000)
    it('bounds the lock waits of rename, delete and the mutation ledger, and keeps busy answers off the budgets', async () => {
      const user = await session(pool, 'busy-budget@example.com')
      const save = await newSave(user.cookie)
      const replaceBody = (key: string) => ({
        ifRevision: 0,
        idempotencyKey: key,
        source: 'dxrating-json',
        records: [],
      })
      const holder = await pool.connect()
      try {
        await holder.query('BEGIN')
        await holder.query('SELECT 1 FROM score_saves WHERE id = $1 FOR UPDATE', [save.id])
        // rename and delete wait on the save row (and hold both write slots) until the lock timeout
        const rename = api(user.cookie, 'PATCH', `/saves/${save.id}`, { name: 'renamed' })
        const remove = api(user.cookie, 'DELETE', `/saves/${save.id}`)
        await new Promise((resolve) => setTimeout(resolve, 300))
        // turned away at once: too many writes in flight
        for (let i = 0; i < 6; i++) {
          const busy = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, replaceBody(`busy-a-${i}`))
          expect(busy.status).toBe(429)
          expect(busy.headers.get('retry-after')).toBe('1')
        }
        const startedAt = Date.now()
        for (const answer of await Promise.all([rename, remove])) {
          expect(answer.status).toBe(429)
          expect(answer.body).toMatchObject({ code: 'TOO_MANY_REQUESTS', data: { retryAfterSeconds: 1 } })
        }
        // lock_timeout bounds each lock wait: the second waiter first waits behind the first one, then on the
        // holder, so it gives up after up to two timeouts
        expect(Date.now() - startedAt).toBeLessThan(12_000)
        // turned away after the lock timeout
        const locked = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, replaceBody('busy-b-key'))
        expect(locked.status, JSON.stringify(locked.body)).toBe(429)
        expect(locked.body).toMatchObject({ data: { retryAfterSeconds: 1 } })
        await holder.query('ROLLBACK')
      } finally {
        await holder.query('ROLLBACK')
        holder.release()
      }
      // none of the 7 busy replaces used the 5-a-day budget
      for (let i = 0; i < 5; i++) {
        const served = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, replaceBody(`served-${i}`))
        expect(served.status, `replace ${i}`).toBe(200)
      }
      expect((await api(user.cookie, 'POST', `/saves/${save.id}/replace`, replaceBody('over-key-1'))).status).toBe(429)
      expect((await api(user.cookie, 'PATCH', `/saves/${save.id}`, { name: 'renamed' })).status).toBe(200)
      expect((await api(user.cookie, 'DELETE', `/saves/${save.id}`)).status).toBe(200)
    }, 40_000)

    it('answers a ledger row held by a batch of another save as busy, not as a server error', async () => {
      const user = await session(pool, 'ledger-busy@example.com')
      const a = await newSave(user.cookie, { name: 'A' })
      const b = await newSave(user.cookie, { name: 'B' })
      const mutation = setMutation(sheetId(1), 1000000)
      const holder = await pool.connect()
      try {
        await holder.query('BEGIN')
        await holder.query(
          `INSERT INTO score_mutations (user_id, mutation_id, save_id, result, created_at) VALUES ($1, $2, $3, $4, now())`,
          [user.userId, mutation.mutationId, a.id, JSON.stringify({ mutationId: mutation.mutationId, status: 'noop' })],
        )
        const answer = await mutate(user.cookie, b.id, [mutation])
        expect(answer.status).toBe(429)
        expect(answer.body).toMatchObject({ code: 'TOO_MANY_REQUESTS', data: { retryAfterSeconds: 1 } })
        await holder.query('ROLLBACK')
      } finally {
        await holder.query('ROLLBACK')
        holder.release()
      }
      // batches with the same mutation ID on two saves at once: one applies it, the other replays its result
      const again = setMutation(sheetId(2), 1000000)
      const answers = await Promise.all([mutate(user.cookie, a.id, [again]), mutate(user.cookie, b.id, [again])])
      expect(answers.map((answer) => answer.status)).toEqual([200, 200])
      expect(answers.map((answer) => answer.body.results[0])).toEqual([
        answers[0]!.body.results[0],
        answers[0]!.body.results[0],
      ])
    }, 20_000)

    it('answers 413 to a chunked upload over the body limit', async () => {
      const user = await session(pool, 'chunked@example.com')
      const save = await newSave(user.cookie)
      // node:http without keep-alive: the server answers before reading the whole upload, so the connection is done
      const chunked = (text: string) =>
        new Promise<{ status: number; body: any; connection?: string }>((resolve, reject) => {
          const request = http.request(
            `${getBaseUrl()}/api/v1/saves/${save.id}/mutations`,
            {
              method: 'POST',
              agent: false,
              headers: {
                'Content-Type': 'application/json',
                Cookie: user.cookie,
                'Transfer-Encoding': 'chunked',
                [CLOUD_SAVE_EXPECTED_USER_HEADER]: user.userId,
              },
            },
            (response) => {
              let data = ''
              response.setEncoding('utf8')
              response.on('data', (chunk: string) => (data += chunk))
              response.on('end', () =>
                resolve({
                  status: response.statusCode ?? 0,
                  body: JSON.parse(data),
                  connection: response.headers.connection,
                }),
              )
            },
          )
          request.on('error', reject)
          for (let offset = 0; offset < text.length; offset += 64 * 1024)
            request.write(text.slice(offset, offset + 64 * 1024))
          request.end()
        })
      const big = await chunked(
        JSON.stringify({ mutations: [{ ...setMutation(sheetId(1), 1000000), padding: 'x'.repeat(3_000_000) }] }),
      )
      expect(big.status).toBe(413)
      expect(big.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 })
      expect(big.connection).toBe('close')
      const small = await chunked(JSON.stringify({ mutations: [setMutation(sheetId(1), 1000000)] }))
      expect(small.status).toBe(200)
    })

    it('limits the import routes per user', async () => {
      const user = await session(pool, 'import-limits@example.com')
      const save = await newSave(user.cookie)
      const body = (i: number) => ({
        idempotencyKey: `import-limit-${i}`,
        source: 'dxrating-json',
        trigger: 'user',
        records: [{ sheetId: sheetId(1), achievement: 1000000, comboFlag: null, syncFlag: null }],
      })
      for (let i = 0; i < 10; i++) {
        expect((await api(user.cookie, 'POST', `/saves/${save.id}/client-imports`, body(i))).status).not.toBe(429)
      }
      const limited = await api(user.cookie, 'POST', `/saves/${save.id}/client-imports`, body(10))
      expect(limited.status).toBe(429)
      expect(limited.headers.get('retry-after')).toBeTruthy()
    })
  })

  describe('saves', () => {
    it('creates, lists, renames and soft-deletes saves', async () => {
      const user = await session(pool, 'saves@example.com')
      const created = await api(user.cookie, 'POST', '/saves', {
        name: 'iPhone JP',
        region: 'jp',
        gameVersion: 'prism',
        clientProfileKey: 'preset-japan',
      })
      expect(created.status).toBe(200)
      expect(created.body).toMatchObject({
        id: expect.stringMatching(/^dsav_[\w-]{21}$/),
        name: 'iPhone JP',
        region: 'jp',
        gameVersion: 'prism',
        clientProfileKey: 'preset-japan',
        revision: 0,
        recordCount: 0,
        latestSnapshot: null,
      })
      expect(created.headers.get('cache-control')).toBe('private, no-store')

      // the same client profile key returns the existing save
      const again = await api(user.cookie, 'POST', '/saves', {
        name: 'Other',
        region: 'intl',
        clientProfileKey: 'preset-japan',
      })
      expect(again.body.id).toBe(created.body.id)
      expect(again.body.name).toBe('iPhone JP')

      const renamed = await api(user.cookie, 'PATCH', `/saves/${created.body.id}`, {
        name: 'Renamed',
        gameVersion: null,
      })
      expect(renamed.status).toBe(200)
      expect(renamed.body).toMatchObject({ name: 'Renamed', gameVersion: null })
      expect((await api(user.cookie, 'PATCH', `/saves/${created.body.id}`, {})).status).toBe(400)

      await api(user.cookie, 'POST', `/saves/${created.body.id}/snapshots`, {
        atRevision: 0,
        b15Sum: 4000,
        b35Sum: 10000,
        b50Sum: 14000,
        recordCount: 0,
        gameVersion: 'prism',
      })
      const listed = await api(user.cookie, 'GET', '/saves')
      expect(listed.body.saves).toHaveLength(1)
      expect(listed.body.saves[0].latestSnapshot).toMatchObject({ b50Sum: 14000 })

      expect((await api(user.cookie, 'DELETE', `/saves/${created.body.id}`)).body).toEqual({ success: true })
      expect((await api(user.cookie, 'GET', '/saves')).body.saves).toEqual([])
      expect((await api(user.cookie, 'DELETE', `/saves/${created.body.id}`)).status).toBe(404)
      expect((await api(user.cookie, 'GET', `/saves/${created.body.id}/changes`)).status).toBe(404)
      const { rows } = await pool.query('SELECT deleted_at FROM score_saves WHERE id = $1', [created.body.id])
      expect(rows[0].deleted_at).not.toBeNull()

      // the profile key is free again
      const recreated = await api(user.cookie, 'POST', '/saves', {
        name: 'New',
        region: 'jp',
        clientProfileKey: 'preset-japan',
      })
      expect(recreated.body.id).not.toBe(created.body.id)
    })

    it('allows at most 10 live saves', async () => {
      const user = await session(pool, 'ten@example.com')
      const ids: string[] = []
      for (let i = 0; i < 10; i++) ids.push((await newSave(user.cookie, { name: `Save ${i}` })).id)
      const over = await api(user.cookie, 'POST', '/saves', { name: 'Eleven', region: 'jp' })
      expect(over.status).toBe(409)
      expect(over.body).toMatchObject({ code: 'CONFLICT', data: { reason: 'SAVE_LIMIT', limit: 10 } })
      await api(user.cookie, 'DELETE', `/saves/${ids[0]}`)
      expect((await api(user.cookie, 'POST', '/saves', { name: 'Eleven', region: 'jp' })).status).toBe(200)
    })
  })

  describe('ownership', () => {
    it("makes another user's save, job and records indistinguishable from missing ones", async () => {
      const owner = await session(pool, 'owner@example.com')
      const intruder = await session(pool, 'intruder@example.com')
      const save = await newSave(owner.cookie)
      await mutate(owner.cookie, save.id, [setMutation(sheetId(1), 1000000)])
      const { job } = await importRecords(owner.userId, save.id, 'lxns', [
        { sheetId: sheetId(2), achievement: 1005000, comboFlag: null, syncFlag: null },
      ])

      const attempts: Array<[string, string, unknown?]> = [
        ['PATCH', `/saves/${save.id}`, { name: 'Mine now' }],
        ['DELETE', `/saves/${save.id}`],
        ['GET', `/saves/${save.id}/changes?since=0`],
        ['POST', `/saves/${save.id}/mutations`, { mutations: [deleteMutation(sheetId(1), 99)] }],
        ['GET', `/saves/${save.id}/records/${sheetId(1)}/events`],
        [
          'POST',
          `/saves/${save.id}/replace`,
          { ifRevision: 2, idempotencyKey: 'steal-000001', source: 'dxrating-json', records: [] },
        ],
        [
          'POST',
          `/saves/${save.id}/snapshots`,
          { atRevision: 0, b15Sum: 0, b35Sum: 0, b50Sum: 0, recordCount: 0, gameVersion: 'prism' },
        ],
        ['GET', `/saves/${save.id}/snapshots`],
        ['GET', `/saves/${save.id}/imports`],
        ['GET', `/imports/${job.id}`],
      ]
      for (const [method, path, body] of attempts) {
        const stolen = await api(intruder.cookie, method, path, body)
        const missing = await api(
          intruder.cookie,
          method,
          path.replace(save.id, 'dsav_doesnotexist').replace(job.id, 'dimp_doesnotexist'),
          body,
        )
        expect(stolen.status, `${method} ${path}`).toBe(404)
        expect(stolen.body, `${method} ${path}`).toEqual(missing.body)
      }
      expect((await api(intruder.cookie, 'GET', '/saves')).body.saves).toEqual([])

      const owned = await api(owner.cookie, 'GET', `/saves/${save.id}/changes?since=0`)
      expect(owned.body.records).toHaveLength(2)
      expect((await api(owner.cookie, 'GET', '/saves')).body.saves[0]).toMatchObject({ name: 'JP main', revision: 2 })
      expect((await api(owner.cookie, 'GET', `/imports/${job.id}`)).body).toMatchObject({
        id: job.id,
        status: 'succeeded',
      })
      expect((await api(owner.cookie, 'GET', `/saves/${save.id}/imports`)).body).toHaveLength(1)
    })
  })

  describe('account binding (§10)', () => {
    const header = CLOUD_SAVE_EXPECTED_USER_HEADER

    it('refuses a request that names another account with 409 ACCOUNT_MISMATCH, before any write', async () => {
      // Another tab signed B in while A's request was on its way: the cookie is B's, the request names A
      const a = await session(pool, 'bound-a@example.com')
      const b = await session(pool, 'bound-b@example.com')
      const saveOfB = await newSave(b.cookie)
      const writes: Array<[string, string, unknown]> = [
        ['POST', '/saves', { name: 'A main', region: 'jp' }],
        ['PATCH', `/saves/${saveOfB.id}`, { name: 'Renamed' }],
        ['POST', `/saves/${saveOfB.id}/mutations`, { mutations: [setMutation(sheetId(1), 1000000)] }],
        [
          'POST',
          `/saves/${saveOfB.id}/replace`,
          { ifRevision: 0, idempotencyKey: 'bound-replace-01', source: 'dxrating-json', records: [] },
        ],
        [
          'POST',
          `/saves/${saveOfB.id}/client-imports`,
          {
            id: uuidv7(),
            idempotencyKey: 'bound-import-0001',
            source: 'aqua-dx',
            trigger: 'user',
            sourceAccountId: null,
            chunkIndex: 0,
            chunkCount: 1,
            records: [{ sheetId: sheetId(2), achievement: 1000000, comboFlag: null, syncFlag: null }],
          },
        ],
        ['DELETE', `/saves/${saveOfB.id}`, undefined],
      ]
      for (const [method, path, body] of writes) {
        const response = await api(b.cookie, method, path, body, { [header]: a.userId })
        expect(response.status, `${method} ${path}`).toBe(409)
        expect(response.body, `${method} ${path}`).toMatchObject({
          code: 'CONFLICT',
          data: { reason: 'ACCOUNT_MISMATCH' },
        })
      }
      // Nothing was written under B
      const saves = (await api(b.cookie, 'GET', '/saves')).body.saves
      expect(saves).toEqual([expect.objectContaining({ id: saveOfB.id, name: 'JP main', revision: 0 })])
      // Reads that name A are refused too; B's own requests go through
      expect(
        (await api(b.cookie, 'GET', `/saves/${saveOfB.id}/changes?since=0`, undefined, { [header]: a.userId })).status,
      ).toBe(409)
      expect((await api(b.cookie, 'GET', `/saves/${saveOfB.id}/changes?since=0`)).status).toBe(200)
    })

    it('requires the header on writes (400) and not on reads; a disabled feature stays a 404', async () => {
      const user = await session(pool, 'unbound@example.com')
      const save = await newSave(user.cookie)
      const none = { [header]: '' }
      const created = await api(user.cookie, 'POST', '/saves', { name: 'x', region: 'jp' }, none)
      expect(created.status).toBe(400)
      expect(created.body).toMatchObject({ code: 'BAD_REQUEST' })
      const mutated = await api(
        user.cookie,
        'POST',
        `/saves/${save.id}/mutations`,
        { mutations: [setMutation(sheetId(1), 1)] },
        none,
      )
      expect(mutated.status).toBe(400)
      expect((await api(user.cookie, 'GET', '/saves', undefined, none)).status).toBe(200)
      expect((await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=0`, undefined, none)).status).toBe(200)

      const off = await session(pool, 'unbound-off@example.com', { cloudSave: false })
      expect((await api(off.cookie, 'POST', '/saves', { name: 'x', region: 'jp' }, none)).status).toBe(404)
      expect(
        (await api(off.cookie, 'POST', '/saves', { name: 'x', region: 'jp' }, { [header]: user.userId })).status,
      ).toBe(404)
    })
  })

  describe('mutations', () => {
    it('applies a batch with per-row revisions, rejects bad items one by one and replays mutation IDs', async () => {
      const user = await session(pool, 'mutations@example.com')
      const save = await newSave(user.cookie)
      const first = setMutation(sheetId(1), 1000000, { comboFlag: 'fc' })
      const batch = [
        first,
        setMutation(sheetId(2), 990000),
        { ...setMutation('dsht_xxxxx', 1000000) },
        { ...setMutation(sheetId(3), 1020000) },
        { ...setMutation(sheetId(4), 1000000), entryMethod: 'import' },
        { ...setMutation(sheetId(5), 1000000), mutationId: 'not-a-uuid' },
        setMutation(sheetId(1), 1001000),
        deleteMutation(sheetId(2)),
      ]
      const response = await mutate(user.cookie, save.id, batch)
      expect(response.status).toBe(200)
      expect(response.body.revision).toBe(4)
      expect(
        response.body.results.map((result: { status: string; reason: string | null }) => [
          result.status,
          result.reason,
        ]),
      ).toEqual([
        ['applied', null],
        ['applied', null],
        ['rejected', 'invalid-sheet-id'],
        ['rejected', 'invalid-achievement'],
        ['rejected', 'invalid-entry-method'],
        ['rejected', 'invalid-mutation-id'],
        ['applied', null],
        ['applied', null],
      ])
      expect(response.body.results[0].record).toMatchObject({
        revision: 1,
        achievement: 1000000,
        provenance: { source: 'manual', verification: 'client_reported', fetchedBy: 'client', entryMethod: 'typed' },
      })
      expect(response.body.results[6].record.revision).toBe(3)
      expect(response.body.results[7].record).toMatchObject({ revision: 4, deletedAt: expect.any(String) })
      expect(await record(save.id, sheetId(1))).toMatchObject({ achievement: 1001000, revision: 3 })
      const { rows } = await pool.query('SELECT revision::integer, record_count FROM score_saves WHERE id = $1', [
        save.id,
      ])
      expect(rows[0]).toEqual({ revision: 4, record_count: 1 })

      // replay: the stored results, nothing applied again, revision unchanged
      const replay = await mutate(user.cookie, save.id, batch)
      expect(replay.body).toEqual(response.body)
      expect(
        (await pool.query('SELECT revision::integer FROM score_saves WHERE id = $1', [save.id])).rows[0].revision,
      ).toBe(4)
      const events = await pool.query('SELECT count(*)::integer AS n FROM score_record_events WHERE save_id = $1', [
        save.id,
      ])
      expect(events.rows[0].n).toBe(4)
      const ledger = await pool.query('SELECT count(*)::integer AS n FROM score_mutations WHERE save_id = $1', [
        save.id,
      ])
      // every item but the one with an invalid mutation ID, which never reaches the ledger
      expect(ledger.rows[0].n).toBe(7)

      // a no-op set writes nothing
      const noop = await mutate(user.cookie, save.id, [setMutation(sheetId(1), 1001000, { basedOnRevision: 4 })])
      expect(noop.body.results[0]).toMatchObject({ status: 'noop', record: { revision: 3 } })
      expect(noop.body.revision).toBe(4)
    })

    it('rejects a mutation ID that is not a UUIDv7 (even with NUL) without the ledger, and applies its siblings', async () => {
      const user = await session(pool, 'nul-id@example.com')
      const save = await newSave(user.cookie)
      const valid = setMutation(sheetId(1), 1000000)
      const batch = [{ ...setMutation(sheetId(2), 1000000), mutationId: '\u0000' }, valid]
      const response = await mutate(user.cookie, save.id, batch)
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        revision: 1,
        results: [
          { mutationId: '\u0000', status: 'rejected', record: null, reason: 'invalid-mutation-id' },
          { mutationId: valid.mutationId, status: 'applied', record: { achievement: 1000000, revision: 1 } },
        ],
      })
      expect(await record(save.id, sheetId(1))).toMatchObject({ achievement: 1000000, revision: 1 })
      expect(await record(save.id, sheetId(2))).toBeUndefined()
      const ledger = await pool.query('SELECT mutation_id FROM score_mutations WHERE save_id = $1', [save.id])
      expect(ledger.rows).toEqual([{ mutation_id: valid.mutationId }])

      // a retry answers the same, and the valid mutation is not applied again
      const replay = await mutate(user.cookie, save.id, batch)
      expect(replay.status).toBe(200)
      expect(replay.body).toEqual(response.body)
      expect(
        (await pool.query('SELECT revision::integer FROM score_saves WHERE id = $1', [save.id])).rows[0].revision,
      ).toBe(1)
    })

    it('merges an identical automatic import again once a manual edit changed the save since', async () => {
      const user = await session(pool, 'short-circuit@example.com')
      const save = await newSave(user.cookie)
      const target = sheetId(30)
      const payload = [{ sheetId: target, achievement: 1000000, comboFlag: null, syncFlag: null }]
      const options = { trigger: 'auto' as const, sourceAccountId: 'friend-sc', sha: 'c'.repeat(64) }
      const first = await importRecords(user.userId, save.id, 'lxns', payload, options)
      expect(first.job.counts).toMatchObject({ inserted: 1 })
      expect(first.job.counts).not.toHaveProperty('saveRevision')

      const downgraded = await mutate(user.cookie, save.id, [
        setMutation(target, 900000, { basedOnRevision: first.revision }),
      ])
      expect(downgraded.body.results[0]).toMatchObject({ status: 'applied', record: { achievement: 900000 } })
      expect(downgraded.body.revision).toBe(first.revision + 1)

      const again = await importRecords(user.userId, save.id, 'lxns', payload, options)
      expect(again.job.counts).toMatchObject({ fetched: 1, improved: 1, unchanged: 0 })
      expect(again.revision).toBe(downgraded.body.revision + 1)
      expect(await record(save.id, target)).toMatchObject({
        achievement: 1000000,
        verification: 'verified',
        source: 'lxns',
        fetched_by: 'server',
        import_job_id: again.job.id,
        revision: again.revision,
      })
      const timeline = await api(user.cookie, 'GET', `/saves/${save.id}/records/${target}/events`)
      expect(timeline.body.map((event: { kind: string }) => event.kind)).toEqual([
        'import_applied',
        'manual_set',
        'import_applied',
      ])

      // the save has not changed since that job: the same payload short-circuits
      const unchanged = await importRecords(user.userId, save.id, 'lxns', payload, options)
      expect(unchanged.job.counts).toMatchObject({ fetched: 1, unchanged: 1, improved: 0 })
      expect(unchanged.revision).toBe(again.revision)
    })

    it('rejects provenance claims in a mutation with 400', async () => {
      const user = await session(pool, 'claims@example.com')
      const save = await newSave(user.cookie)
      const claimed = { ...setMutation(sheetId(1), 1000000), verification: 'verified' }
      expect((await mutate(user.cookie, save.id, [claimed])).status).toBe(400)
      const valueClaim = setMutation(sheetId(1), 1000000)
      ;(valueClaim.value as Record<string, unknown>).fetchedBy = 'server'
      expect((await mutate(user.cookie, save.id, [valueClaim])).status).toBe(400)
      expect(await record(save.id, sheetId(1))).toBeUndefined()
    })

    it('supersedes a stale manual edit of a verified record, then applies the explicit re-apply as user_edited', async () => {
      const user = await session(pool, 'stale@example.com')
      const save = await newSave(user.cookie)
      const target = sheetId(10)
      // revisions 1-5: the target and four others; device A has pulled up to revision 5
      await mutate(user.cookie, save.id, [
        setMutation(target, 980000),
        ...[11, 12, 13, 14].map((n) => setMutation(sheetId(n), 970000)),
      ])
      // a verified import (server job) improves the target at revision 6
      const imported = await importRecords(user.userId, save.id, 'lxns', [
        { sheetId: target, achievement: 1005000, comboFlag: null, syncFlag: null },
      ])
      expect(imported.revision).toBe(6)
      expect(await record(save.id, target)).toMatchObject({ verification: 'verified', revision: 6 })

      // device A, offline at baseline 5, set 99.0000%
      const stale = await mutate(user.cookie, save.id, [setMutation(target, 990000, { basedOnRevision: 5 })])
      expect(stale.body.results[0]).toMatchObject({
        status: 'superseded',
        record: { achievement: 1005000, revision: 6, provenance: { verification: 'verified' } },
      })
      expect(stale.body.revision).toBe(6)
      expect(await record(save.id, target)).toMatchObject({ achievement: 1005000, verification: 'verified' })

      // "use my value anyway": resubmitted with the new baseline
      const explicit = await mutate(user.cookie, save.id, [setMutation(target, 990000, { basedOnRevision: 6 })])
      expect(explicit.body.results[0]).toMatchObject({
        status: 'applied',
        record: {
          achievement: 990000,
          revision: 7,
          provenance: { verification: 'user_edited', editedFromJobId: imported.job.id },
        },
      })

      const events = await api(user.cookie, 'GET', `/saves/${save.id}/records/${target}/events`)
      expect(events.body.map((event: { kind: string }) => event.kind)).toEqual([
        'manual_set',
        'superseded',
        'import_applied',
        'manual_set',
      ])
      expect(events.body[1]).toMatchObject({ achievement: 990000, provenance: { source: 'manual' } })
    })

    it('marks a manual improvement of a verified record user_edited until a strictly better import', async () => {
      const user = await session(pool, 'improve@example.com')
      const save = await newSave(user.cookie)
      const target = sheetId(20)
      const imported = await importRecords(user.userId, save.id, 'maimai-net-jp', [
        { sheetId: target, achievement: 1000000, comboFlag: 'fc', syncFlag: null },
      ])
      const improved = await mutate(user.cookie, save.id, [setMutation(target, 1003000, { basedOnRevision: 0 })])
      expect(improved.body.results[0]).toMatchObject({
        status: 'applied',
        record: { provenance: { verification: 'user_edited', source: 'manual', editedFromJobId: imported.job.id } },
      })
      const timeline = await api(user.cookie, 'GET', `/saves/${save.id}/records/${target}/events`)
      expect(
        timeline.body.map((event: { kind: string; provenance: { verification: string } }) => [
          event.kind,
          event.provenance.verification,
        ]),
      ).toEqual([
        ['manual_set', 'user_edited'],
        ['import_applied', 'verified'],
      ])

      // an equal import keeps the user edit; a strictly better one is verified again
      const equal = await importRecords(user.userId, save.id, 'maimai-net-jp', [
        { sheetId: target, achievement: 1003000, comboFlag: null, syncFlag: null },
      ])
      expect(equal.job.counts.keptUserEdit).toBe(1)
      const better = await importRecords(user.userId, save.id, 'maimai-net-jp', [
        { sheetId: target, achievement: 1004000, comboFlag: null, syncFlag: null },
      ])
      expect(better.job.counts.improved).toBe(1)
      expect(await record(save.id, target)).toMatchObject({ verification: 'verified', achievement: 1004000 })

      // a new manual entry on another chart is client_reported
      const fresh = await mutate(user.cookie, save.id, [setMutation(sheetId(21), 1000000)])
      expect(fresh.body.results[0].record.provenance).toMatchObject({
        verification: 'client_reported',
        editedFromJobId: null,
      })
    })

    it('drops the manual edit fields when an import or a replace takes over a record with the same value', async () => {
      const user = await session(pool, 'takeover@example.com')
      const save = await newSave(user.cookie)
      const clientFields = async (sheet: string) =>
        (
          await pool.query(
            `SELECT client_mutation_id, client_edited_at, verification, deleted_at IS NOT NULL AS deleted
             FROM score_records WHERE save_id = $1 AND sheet_id = $2`,
            [save.id, sheet],
          )
        ).rows[0]
      const latestEvent = async (sheet: string) =>
        (
          await pool.query(
            `SELECT kind, client_mutation_id FROM score_record_events WHERE save_id = $1 AND sheet_id = $2
             ORDER BY id DESC LIMIT 1`,
            [save.id, sheet],
          )
        ).rows[0]
      const edits = [1, 2].map((n) => ({
        ...setMutation(sheetId(n), 1005000),
        clientEditedAt: '2026-11-01T00:00:00.000Z',
      }))
      // an edit time PostgreSQL cannot store rejects that item only; its valid sibling commits
      const yearZero = { ...setMutation(sheetId(3), 1000000), clientEditedAt: '0000-01-01T00:00:00.000Z' }
      const sibling = setMutation(sheetId(4), 1000000)
      const mixed = await mutate(user.cookie, save.id, [yearZero, sibling])
      expect(mixed.status).toBe(200)
      expect(mixed.body.results.map((r: { status: string; reason: string | null }) => [r.status, r.reason])).toEqual([
        ['rejected', 'invalid-client-edited-at'],
        ['applied', null],
      ])
      expect(await clientFields(sheetId(4))).toMatchObject({ deleted: false })
      expect((await mutate(user.cookie, save.id, edits)).body.results.map((r: { status: string }) => r.status)).toEqual(
        ['applied', 'applied'],
      )
      expect(await clientFields(sheetId(1))).toMatchObject({
        client_mutation_id: edits[0]!.mutationId,
        client_edited_at: new Date('2026-11-01T00:00:00.000Z'),
      })

      // a server import of the same value upgrades sheet 1: verified, no client edit left
      const upgraded = await importRecords(user.userId, save.id, 'maimai-net-jp', [
        { sheetId: sheetId(1), achievement: 1005000, comboFlag: null, syncFlag: null },
      ])
      expect(upgraded.job.counts.provenanceUpgraded).toBe(1)
      expect(await clientFields(sheetId(1))).toEqual({
        client_mutation_id: null,
        client_edited_at: null,
        verification: 'verified',
        deleted: false,
      })
      expect(await latestEvent(sheetId(1))).toEqual({ kind: 'provenance_upgraded', client_mutation_id: null })
      const changes = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=0`)
      const dto = changes.body.records.find((r: { sheetId: string }) => r.sheetId === sheetId(1))
      expect(dto.clientEditedAt).toBeNull()

      // a replace rewrites sheet 1 (same value) and deletes sheet 2: neither is attributed to the old edit
      const replaced = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, {
        ifRevision: upgraded.revision,
        idempotencyKey: 'takeover-replace',
        source: 'dxrating-json',
        records: [{ sheetId: sheetId(1), achievement: 1005000, comboFlag: null, syncFlag: null }],
      })
      expect(replaced.status).toBe(200)
      expect(await latestEvent(sheetId(1))).toEqual({ kind: 'import_applied', client_mutation_id: null })
      expect(await clientFields(sheetId(2))).toMatchObject({
        client_mutation_id: null,
        client_edited_at: null,
        deleted: true,
      })
      expect(await latestEvent(sheetId(2))).toEqual({ kind: 'delete', client_mutation_id: null })
      const pulled = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=${upgraded.revision}`)
      const tombstone = pulled.body.records.find((r: { sheetId: string }) => r.sheetId === sheetId(2))
      expect(tombstone).toMatchObject({ deletedAt: expect.any(String), clientEditedAt: null })
    })
  })

  describe('changes', () => {
    it('pulls incremental changes with tombstones and asks for a reset once tombstones are purged', async () => {
      const user = await session(pool, 'changes@example.com')
      const save = await newSave(user.cookie)
      await mutate(user.cookie, save.id, [
        setMutation(sheetId(1), 1000000),
        setMutation(sheetId(2), 1000000),
        setMutation(sheetId(3), 1000000),
      ])
      await mutate(user.cookie, save.id, [deleteMutation(sheetId(2))])

      const full = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=0`)
      expect(full.body).toMatchObject({
        // the last page resumes at the save's revision
        nextSince: 4,
        hasMore: false,
        revision: 4,
        resetRequired: false,
        checksum: { count: 2, sumAchievement: 2000000 },
      })
      expect(full.body.records.map((r: { sheetId: string }) => r.sheetId)).toEqual([sheetId(1), sheetId(3)])

      const incremental = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=3&limit=10`)
      expect(incremental.body.records).toEqual([
        expect.objectContaining({ sheetId: sheetId(2), deletedAt: expect.any(String) }),
      ])
      expect(incremental.body.nextSince).toBe(4)

      const paged = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=1&limit=1`)
      expect(paged.body).toMatchObject({ nextSince: 3, hasMore: true, checksum: null })
      expect(paged.body.records.map((r: { sheetId: string }) => r.sheetId)).toEqual([sheetId(3)])
      expect((await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=0&limit=1001`)).status).toBe(400)

      // the tombstone is purged 90 days later; a cursor older than it must reset
      await pool.query(
        `UPDATE score_records SET deleted_at = now() - interval '91 days' WHERE save_id = $1 AND deleted_at IS NOT NULL`,
        [save.id],
      )
      const report = await runDatabase((database) => runCloudSaveCleanup(database, new Date()))
      expect(report.tombstonesPurged).toBe(1)
      const reset = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=3`)
      expect(reset.body).toMatchObject({ resetRequired: true, records: [], nextSince: 0, checksum: null, revision: 4 })
      const current = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=4`)
      expect(current.body).toMatchObject({ resetRequired: false, records: [] })
      const ahead = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=5`)
      expect(ahead.body.resetRequired).toBe(true)
      const rebuilt = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=0`)
      expect(rebuilt.body).toMatchObject({ resetRequired: false, checksum: { count: 2 }, nextSince: 4 })

      // a paged full pull finishes although its cursor stays below the horizon (live rows keep old revisions)
      const pages: { records: { sheetId: string }[]; resetRequired: boolean; nextSince: number }[] = []
      let since = 0
      for (let guard = 0; guard < 5; guard++) {
        const mode = since === 0 ? '' : '&mode=full'
        const page = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=${since}&limit=1${mode}`)
        expect(page.status).toBe(200)
        pages.push(page.body)
        since = page.body.nextSince
        if (!page.body.hasMore) break
      }
      expect(pages.map((page) => page.resetRequired)).toEqual([false, false])
      expect(pages.flatMap((page) => page.records.map((r) => r.sheetId))).toEqual([sheetId(1), sheetId(3)])
      expect(pages.map((page) => page.nextSince)).toEqual([1, 4])
      // the cursor it ends with pulls incrementally without a reset
      const after = await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=${since}`)
      expect(after.body).toMatchObject({ resetRequired: false, records: [] })
      // an incremental pull from the same low cursor still resets
      expect((await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=1`)).body.resetRequired).toBe(true)
      expect((await api(user.cookie, 'GET', `/saves/${save.id}/changes?since=1&mode=bogus`)).status).toBe(400)
    })
  })

  describe('replace', () => {
    it('replaces the document behind a revision precondition, as client_reported, once per key', async () => {
      const user = await session(pool, 'replace@example.com')
      const save = await newSave(user.cookie)
      await importRecords(user.userId, save.id, 'lxns', [
        { sheetId: sheetId(1), achievement: 1005000, comboFlag: null, syncFlag: null },
        { sheetId: sheetId(2), achievement: 1000000, comboFlag: null, syncFlag: null },
        { sheetId: sheetId(3), achievement: 1000000, comboFlag: null, syncFlag: null },
      ])
      const body = {
        ifRevision: 3,
        idempotencyKey: 'replace-key-1',
        source: 'dxrating-json',
        records: [
          { sheetId: sheetId(1), achievement: 990000, comboFlag: null, syncFlag: null, claimedSource: 'lxns' },
          { sheetId: sheetId(4), achievement: 1000000, comboFlag: 'ap', syncFlag: null },
          { sheetId: sheetId(3), achievement: 2000000, comboFlag: null, syncFlag: null },
        ],
      }
      expect((await api(user.cookie, 'POST', `/saves/${save.id}/replace`, { ...body, ifRevision: 2 })).status).toBe(412)
      const stale = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, { ...body, ifRevision: 2 })
      expect(stale.body).toMatchObject({ code: 'PRECONDITION_FAILED', data: { revision: 3 } })
      expect(
        (await api(user.cookie, 'POST', `/saves/${save.id}/replace`, { ...body, verification: 'verified' })).status,
      ).toBe(400)

      const replaced = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, body)
      expect(replaced.status).toBe(200)
      expect(replaced.body.job).toMatchObject({
        source: 'dxrating-json',
        fetchedBy: 'client',
        trigger: 'user',
        status: 'succeeded',
        counts: { fetched: 3, inserted: 1, improved: 1, rejected: 1 },
      })
      // sheet 1 overwritten (even though worse), 4 inserted, 2 deleted, 3 rejected and left alone
      expect(replaced.body.revision).toBe(6)
      expect(await record(save.id, sheetId(1))).toMatchObject({
        achievement: 990000,
        verification: 'client_reported',
        fetched_by: 'client',
        deleted_at: null,
      })
      expect((await record(save.id, sheetId(2))).deleted_at).not.toBeNull()
      expect(await record(save.id, sheetId(3))).toMatchObject({
        achievement: 1000000,
        verification: 'verified',
        deleted_at: null,
      })
      expect(await record(save.id, sheetId(4))).toMatchObject({ verification: 'client_reported' })

      const replay = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, body)
      expect(replay.status).toBe(200)
      expect(replay.body).toEqual(replaced.body)
    })

    it('counts a deeply nested record as rejected, never a stack overflow (raw body through the route)', async () => {
      const user = await session(pool, 'replace-nested@example.com')
      const save = await newSave(user.cookie)
      const depth = 20_000
      const nested = `${'['.repeat(depth)}1${']'.repeat(depth)}`
      const body = `{"ifRevision":0,"idempotencyKey":"replace-nested-1","source":"dxrating-json","records":[{"sheetId":"${sheetId(1)}","achievement":${nested},"comboFlag":null,"syncFlag":null},{"sheetId":"${sheetId(2)}","achievement":1000000,"comboFlag":null,"syncFlag":null}]}`
      expect(body.length).toBeLessThan(CLOUD_SAVE_LARGE_BODY_LIMIT_BYTES)
      const response = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, body)
      expect(response.status).toBe(200)
      expect(response.body.job.counts).toMatchObject({ fetched: 2, inserted: 1, rejected: 1 })
      // the hash covers the validated records only
      expect(response.body.job.rawPayloadSha256).toBe(
        canonicalSha256([{ sheetId: sheetId(2), achievement: 1000000, comboFlag: null, syncFlag: null }]),
      )
      expect(await record(save.id, sheetId(2))).toMatchObject({ achievement: 1000000 })
      expect(await record(save.id, sheetId(1))).toBeUndefined()
      expect(() => canonicalSha256(JSON.parse(nested))).toThrow(RangeError)
    })

    it('logs a same-value replace over a verified record as an overwrite, not a provenance upgrade', async () => {
      const user = await session(pool, 'replace-same@example.com')
      const save = await newSave(user.cookie)
      await importRecords(user.userId, save.id, 'lxns', [
        { sheetId: sheetId(1), achievement: 1005000, comboFlag: null, syncFlag: null },
      ])
      const replaced = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, {
        ifRevision: 1,
        idempotencyKey: 'replace-same-1',
        source: 'dxrating-json',
        records: [{ sheetId: sheetId(1), achievement: 1005000, comboFlag: null, syncFlag: null }],
      })
      expect(replaced.status).toBe(200)
      expect(replaced.body.job.counts).toMatchObject({ improved: 1, provenanceUpgraded: 0, unchanged: 0 })
      expect(await record(save.id, sheetId(1))).toMatchObject({ verification: 'client_reported', revision: 2 })
      const events = await api(user.cookie, 'GET', `/saves/${save.id}/records/${sheetId(1)}/events`)
      expect(events.body.map((event: { kind: string }) => event.kind)).toEqual(['import_applied', 'import_applied'])
    })
  })

  describe('snapshots', () => {
    it('keeps one snapshot per 10 minutes, newest first, and refuses one ahead of the save', async () => {
      const user = await session(pool, 'snapshots@example.com')
      const save = await newSave(user.cookie)
      const snapshot = (b50Sum: number, atRevision = 0) =>
        api(user.cookie, 'POST', `/saves/${save.id}/snapshots`, {
          atRevision,
          b15Sum: 1,
          b35Sum: 2,
          b50Sum,
          recordCount: 0,
          gameVersion: 'prism',
          detail: { b15: [] },
        })
      const first = await snapshot(100)
      const second = await snapshot(200)
      expect(second.body.id).toBe(first.body.id)
      expect(second.body).toMatchObject({ b50Sum: 200, createdAt: first.body.createdAt, detail: { b15: [] } })
      await pool.query(
        `UPDATE score_save_snapshots SET created_at = now() - interval '11 minutes' WHERE save_id = $1`,
        [save.id],
      )
      const third = await snapshot(300)
      expect(third.body.id).not.toBe(first.body.id)
      const list = await api(user.cookie, 'GET', `/saves/${save.id}/snapshots`)
      expect(list.body.map((s: { b50Sum: number }) => s.b50Sum)).toEqual([300, 200])
      expect((await snapshot(1, 1)).status).toBe(400)
    })
  })

  describe('export', () => {
    it('streams every save with records, provenance, jobs, events and snapshots', async () => {
      const user = await session(pool, 'export@example.com')
      const save = await newSave(user.cookie, { clientProfileKey: 'web-local' })
      await importRecords(user.userId, save.id, 'lxns', [
        {
          sheetId: sheetId(1),
          achievement: 1005432,
          comboFlag: 'ap',
          syncFlag: 'fsd',
          providerRecordId: '417',
          dxScore: 2400,
        },
      ])
      await mutate(user.cookie, save.id, [setMutation(sheetId(2), 990000), deleteMutation(sheetId(2))])
      await api(user.cookie, 'POST', `/saves/${save.id}/snapshots`, {
        atRevision: 3,
        b15Sum: 1,
        b35Sum: 2,
        b50Sum: 3,
        recordCount: 1,
        gameVersion: 'prism',
      })

      const response = await fetch(`${getBaseUrl()}/api/v1/me/export`, { headers: { Cookie: user.cookie } })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="dxrating-cloud-export-/)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      const document = await response.json()
      expect(document).toMatchObject({ format: 'dxrating-cloud-save-export', version: 1 })
      expect(document.saves).toHaveLength(1)
      const exported = document.saves[0]
      expect(exported).toMatchObject({ id: save.id, clientProfileKey: 'web-local', deletedAt: null, revision: 3 })
      expect(exported.records).toEqual([
        expect.objectContaining({
          sheetId: sheetId(1),
          achievementRate: 100.5432,
          achievement: 1005432,
          comboFlag: 'ap',
          syncFlag: 'fsd',
          dxScore: 2400,
          dxrating: { source: 'lxns', providerRecordId: 417, dxScore: 2400 },
          provenance: expect.objectContaining({ source: 'lxns', verification: 'verified', fetchedBy: 'server' }),
        }),
      ])
      expect(exported.tombstones).toEqual([
        expect.objectContaining({ sheetId: sheetId(2), deletedAt: expect.any(String) }),
      ])
      expect(exported.importJobs).toEqual([expect.objectContaining({ source: 'lxns', status: 'succeeded' })])
      expect(exported.events.map((event: { kind: string }) => event.kind)).toEqual([
        'import_applied',
        'manual_set',
        'delete',
      ])
      expect(exported.snapshots).toEqual([expect.objectContaining({ b50Sum: 3 })])
      expect(JSON.stringify(document)).not.toContain(user.userId)

      // the trailing-slash spelling is the same streaming route, not the in-memory procedure
      const slashed = await fetch(`${getBaseUrl()}/api/v1/me/export/`, { headers: { Cookie: user.cookie } })
      expect(slashed.status).toBe(200)
      expect(slashed.headers.get('content-type')).toBe(response.headers.get('content-type'))
      expect(slashed.headers.get('content-disposition')).toMatch(/^attachment; filename="dxrating-cloud-export-/)
      expect((await slashed.json()).saves).toHaveLength(1)
    })

    it('is one consistent snapshot: a write landing while the file downloads is not half in it', async () => {
      const user = await session(pool, 'export-snapshot@example.com')
      const save = await newSave(user.cookie)
      await mutate(user.cookie, save.id, [setMutation(sheetId(1), 1000000), setMutation(sheetId(2), 990000)])
      const database = await runDatabase((db) => Effect.succeed(db))
      const run = <A, E>(effect: Effect.Effect<A, E, never>) => appRuntime.runPromise(effect)

      const chunks = exportChunks(run, database, user.userId, new Date())
      // The first chunk is sent once the snapshot is taken
      const parts = [(await chunks.next()).value as string]
      // Lands mid-download: changes a record, adds one and deletes one, and bumps the save's revision
      const write = await mutate(user.cookie, save.id, [
        setMutation(sheetId(1), 1005000),
        setMutation(sheetId(3), 980000),
        deleteMutation(sheetId(2)),
      ])
      expect(write.status).toBe(200)
      for await (const part of chunks) parts.push(part)

      const [exported] = JSON.parse(parts.join('')).saves
      expect(exported.revision).toBe(2)
      expect(
        exported.records.map((record: { sheetId: string; achievement: number }) => [
          record.sheetId,
          record.achievement,
        ]),
      ).toEqual([
        [sheetId(1), 1000000],
        [sheetId(2), 990000],
      ])
      expect(exported.tombstones).toEqual([])
      expect(exported.events).toHaveLength(2)
      // The next export has the write, whole
      const after = (await (await authenticatedFetch(`${getBaseUrl()}/api/v1/me/export`, user.cookie)).json()).saves[0]
      expect(after.revision).toBe(5)
      expect(after.records.map((record: { sheetId: string }) => record.sheetId)).toEqual([sheetId(1), sheetId(3)])
      expect(after.tombstones).toHaveLength(1)
    })

    it('ends its transaction when the download stops early', async () => {
      const user = await session(pool, 'export-abandoned@example.com')
      const save = await newSave(user.cookie)
      await mutate(user.cookie, save.id, [setMutation(sheetId(1), 1000000)])
      const database = await runDatabase((db) => Effect.succeed(db))
      const chunks = exportChunks((effect) => appRuntime.runPromise(effect), database, user.userId, new Date())
      await chunks.next()
      await expect(chunks.return(undefined)).resolves.toEqual({ done: true, value: undefined })
      const open = await pool.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity WHERE state LIKE 'idle in transaction%' AND query LIKE '%score_saves%'`,
      )
      expect(open.rows[0].n).toBe(0)
    })

    it('answers a retryable 429 that costs nothing while every export slot is taken', async () => {
      const user = await session(pool, 'export-busy@example.com')
      const held = Array.from({ length: EXPORT_CONCURRENCY }, () => tryAcquireExportSlot()!)
      try {
        const busy = await api(user.cookie, 'GET', '/me/export')
        expect(busy.status).toBe(429)
        expect(busy.headers.get('retry-after')).toBe('5')
        expect(busy.body).toMatchObject({ code: 'TOO_MANY_REQUESTS', data: { retryAfterSeconds: 5 } })
      } finally {
        for (const release of held) release()
      }
      // The busy answer used none of the 5 daily exports
      for (let i = 0; i < 5; i++) expect((await api(user.cookie, 'GET', '/me/export')).status).toBe(200)
      expect((await api(user.cookie, 'GET', '/me/export')).status).toBe(429)
    })
  })

  describe('record limit', () => {
    it('refuses new charts once a save stores CLOUD_SAVE_MAX_RECORDS_PER_SAVE records', async () => {
      const user = await session(pool, 'record-limit@example.com')
      const save = await newSave(user.cookie)
      // the save holds the limit (one tombstone among them), written directly
      const sheets = Array.from({ length: CLOUD_SAVE_MAX_RECORDS_PER_SAVE }, (_, i) => sheetId(i))
      await pool.query(
        `INSERT INTO score_records (save_id, sheet_id, user_id, achievement, source, fetched_by, verification,
           entry_method, revision, deleted_at)
         SELECT $1, s.sheet_id, $2, 1000000, 'manual', 'client', 'client_reported', 'typed', 1,
           CASE WHEN s.sheet_id = $4 THEN now() END
         FROM unnest($3::text[]) AS s(sheet_id)`,
        [save.id, user.userId, sheets, sheets[0]],
      )
      await pool.query(`UPDATE score_saves SET revision = 1, record_count = $2 WHERE id = $1`, [
        save.id,
        sheets.length - 1,
      ])

      const outside = sheetId(CLOUD_SAVE_MAX_RECORDS_PER_SAVE + 1)
      const answer = await mutate(user.cookie, save.id, [
        setMutation(outside, 1000000),
        setMutation(sheetId(5), 1005000),
        setMutation(sheetId(0), 1005000),
      ])
      expect(answer.status).toBe(200)
      expect(answer.body.results.map((r: { status: string; reason: string | null }) => [r.status, r.reason])).toEqual([
        ['rejected', 'record-limit'],
        ['applied', null],
        // reviving a tombstone needs no new row
        ['applied', null],
      ])
      expect(await record(save.id, outside)).toBeUndefined()

      const imported = await importRecords(user.userId, save.id, 'dxrating-json', [
        { sheetId: outside, achievement: 1000000, comboFlag: null, syncFlag: null },
        { sheetId: sheetId(6), achievement: 1006000, comboFlag: null, syncFlag: null },
      ])
      expect(imported.job.counts).toMatchObject({ fetched: 2, rejected: 1, improved: 1, inserted: 0 })
      expect(await record(save.id, outside)).toBeUndefined()

      const replaced = await api(user.cookie, 'POST', `/saves/${save.id}/replace`, {
        ifRevision: imported.revision,
        idempotencyKey: 'record-limit-replace',
        source: 'dxrating-json',
        records: [{ sheetId: outside, achievement: 1000000, comboFlag: null, syncFlag: null }],
      })
      expect(replaced.status).toBe(400)
      expect(await record(save.id, outside)).toBeUndefined()
    }, 30_000)
  })

  it('accepts PATCH and DELETE from the web origin (CORS)', async () => {
    const response = await fetch(`${getBaseUrl()}/api/v1/saves/dsav_x`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://dxrating.net', 'Access-Control-Request-Method': 'PATCH' },
    })
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH')
    expect(response.headers.get('access-control-allow-methods')).toContain('DELETE')
  })

  it('generates distinct UUIDv7 mutation IDs in the helpers', () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})