import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// config.ts reads the environment once, at import: cloud save is on only for users with a flag row.
vi.hoisted(() => {
  process.env.CLOUD_SAVE_MODE = 'allowlist'
  process.env.CLOUD_SAVE_ALLOWLIST_EMAILS = ''
})

import { runCloudSaveCleanup } from '../services/cloud-save/cleanup'
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
import { cleanDatabase, getBaseUrl, setupTestServer, teardownTestServer } from './setup'

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
      expect(ledger.rows[0].n).toBe(8)

      // a no-op set writes nothing
      const noop = await mutate(user.cookie, save.id, [setMutation(sheetId(1), 1001000, { basedOnRevision: 4 })])
      expect(noop.body.results[0]).toMatchObject({ status: 'noop', record: { revision: 3 } })
      expect(noop.body.revision).toBe(4)
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
        nextSince: 3,
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
      expect(rebuilt.body).toMatchObject({ resetRequired: false, checksum: { count: 2 } })
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
    })
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