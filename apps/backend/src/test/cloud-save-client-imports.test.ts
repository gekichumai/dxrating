import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.CLOUD_SAVE_MODE = 'allowlist'
  process.env.SERVER_IMPORTS = 'off'
})

import { canonicalSha256, startImportJob } from '../services/cloud-save/jobs'
import { api, deleteMutation, runDatabase, session, sheetId } from './cloud-save-helpers'
import { cleanDatabase, setupTestServer, teardownTestServer } from './setup'

let pool: pg.Pool
let email = 0

const newUser = async () => {
  const user = await session(pool, `client-import-${++email}-${randomUUID().slice(0, 8)}@example.com`)
  const save = await api(user.cookie, 'POST', '/saves', { name: 'JP', region: 'jp' })
  return { ...user, saveId: save.body.id as string }
}

const record = (n: number, achievement = 1000000 + (n % 1000), extra: Record<string, unknown> = {}) => ({
  sheetId: sheetId(n),
  achievement,
  comboFlag: null,
  syncFlag: null,
  ...extra,
})

const upload = (cookie: string, saveId: string, body: Record<string, unknown>) =>
  api(cookie, 'POST', `/saves/${saveId}/client-imports`, {
    source: 'aqua-dx',
    trigger: 'user',
    ...body,
  })

const stored = async (saveId: string) =>
  (
    await pool.query(
      `SELECT sheet_id, source, claimed_source, fetched_by, verification, entry_method, raw_payload_sha256,
         source_account_id, import_job_id
       FROM score_records WHERE save_id = $1 ORDER BY sheet_id`,
      [saveId],
    )
  ).rows

beforeAll(async () => {
  await setupTestServer()
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
})

afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

beforeEach(cleanDatabase)

describe('client imports', () => {
  it('uploads in chunks of 5000: each chunk in its own transaction, the last one completes the job', async () => {
    const user = await newUser()
    const idempotencyKey = `chunked-${randomUUID()}`
    const chunk0 = Array.from({ length: 5000 }, (_, i) => record(i + 1))
    const chunk1 = Array.from({ length: 1200 }, (_, i) => record(i + 5001))

    const first = await upload(user.cookie, user.saveId, {
      idempotencyKey,
      chunkIndex: 0,
      chunkCount: 2,
      records: chunk0,
    })
    expect(first.status).toBe(200)
    expect(first.body.job).toMatchObject({
      status: 'running',
      fetchedBy: 'client',
      rawPayloadSha256: null,
      counts: { fetched: 5000, inserted: 5000 },
    })
    expect(first.body.revision).toBe(5000)

    // a lost answer: the client sends chunk 0 again, which is not applied twice
    const replay = await upload(user.cookie, user.saveId, {
      idempotencyKey,
      chunkIndex: 0,
      chunkCount: 2,
      records: chunk0,
    })
    expect(replay.status).toBe(200)
    expect(replay.body).toEqual(first.body)

    const last = await upload(user.cookie, user.saveId, {
      idempotencyKey,
      chunkIndex: 1,
      chunkCount: 2,
      records: chunk1,
    })
    expect(last.body.job).toMatchObject({
      id: first.body.job.id,
      status: 'succeeded',
      counts: { fetched: 6200, inserted: 6200, rejected: 0 },
      rawPayloadSha256: canonicalSha256([canonicalSha256(chunk0), canonicalSha256(chunk1)]),
    })
    expect(last.body.revision).toBe(6200)
    // each record carries the hash of the chunk it came in
    const rows = await stored(user.saveId)
    expect(rows).toHaveLength(6200)
    expect(rows.find((r) => r.sheet_id === sheetId(1))?.raw_payload_sha256).toBe(canonicalSha256(chunk0))
    expect(rows.find((r) => r.sheet_id === sheetId(5001))?.raw_payload_sha256).toBe(canonicalSha256(chunk1))
    expect(rows.every((r) => r.verification === 'client_reported' && r.fetched_by === 'client')).toBe(true)
    expect(rows.every((r) => r.entry_method === 'file' && r.source === 'aqua-dx')).toBe(true)

    // after the job ended, any chunk is a replay
    const after = await upload(user.cookie, user.saveId, {
      idempotencyKey,
      chunkIndex: 1,
      chunkCount: 2,
      records: chunk1,
    })
    expect(after.body).toEqual(last.body)
    // the DTO never shows the chunk state kept with the counts
    expect(Object.keys(last.body.job.counts)).not.toContain('chunks')
  })

  it('refuses a chunkCount that differs from the earlier chunks, and a key of another source', async () => {
    const user = await newUser()
    const idempotencyKey = `chunked-${randomUUID()}`
    await upload(user.cookie, user.saveId, { idempotencyKey, chunkIndex: 0, chunkCount: 3, records: [record(1)] })
    const mismatch = await upload(user.cookie, user.saveId, {
      idempotencyKey,
      chunkIndex: 1,
      chunkCount: 2,
      records: [record(2)],
    })
    expect(mismatch.status).toBe(400)
    const otherSource = await upload(user.cookie, user.saveId, {
      idempotencyKey,
      source: 'mu-net',
      chunkIndex: 1,
      chunkCount: 3,
      records: [record(2)],
    })
    expect(otherSource.status).toBe(400)
    const outOfRange = await upload(user.cookie, user.saveId, {
      idempotencyKey,
      chunkIndex: 3,
      chunkCount: 3,
      records: [record(2)],
    })
    expect(outOfRange.status).toBe(400)
  })

  it('stores a claimed provider as claimed_source only, client_reported, with the claimed account', async () => {
    const user = await newUser()
    const response = await upload(user.cookie, user.saveId, {
      idempotencyKey: `claim-${randomUUID()}`,
      source: 'dxrating-json',
      sourceAccountId: 'claimed-friend-code',
      fetchedAt: '2026-11-01T00:00:00.000Z',
      rawPayloadSha256: 'f'.repeat(64),
      records: [record(1, 1005000, { claimedSource: 'lxns' }), record(2, 990000, { claimedSource: 'maimai-net' })],
    })
    expect(response.status).toBe(200)
    expect(response.body.job).toMatchObject({
      source: 'dxrating-json',
      fetchedBy: 'client',
      sourceAccountId: 'claimed-friend-code',
      sourceAccountKind: 'claimed',
      fetchedAt: '2026-11-01T00:00:00.000Z',
      status: 'succeeded',
    })
    // the server computes the payload hash itself; the client's differing value is not stored
    const records = [record(1, 1005000, { claimedSource: 'lxns' }), record(2, 990000, { claimedSource: 'maimai-net' })]
    expect(response.body.job.rawPayloadSha256).toBe(canonicalSha256(records))
    expect((await stored(user.saveId)).map((r) => [r.source, r.claimed_source, r.verification])).toEqual([
      ['dxrating-json', 'lxns', 'client_reported'],
      ['dxrating-json', 'maimai-net', 'client_reported'],
    ])
  })

  it('rejects demo data, server sources and provenance fields', async () => {
    const user = await newUser()
    const base = { idempotencyKey: `reject-${randomUUID()}`, records: [record(1)] }
    expect((await upload(user.cookie, user.saveId, { ...base, source: 'demo' })).status).toBe(400)
    expect((await upload(user.cookie, user.saveId, { ...base, source: 'lxns' })).status).toBe(400)
    expect((await upload(user.cookie, user.saveId, { ...base, source: 'maimai-net-jp' })).status).toBe(400)
    expect((await upload(user.cookie, user.saveId, { ...base, verification: 'verified' })).status).toBe(400)
    expect((await upload(user.cookie, user.saveId, { ...base, fetchedBy: 'server' })).status).toBe(400)
    expect(
      (await upload(user.cookie, user.saveId, { ...base, records: [record(1, 1000000, { verification: 'verified' })] }))
        .status,
    ).toBe(400)
    expect(await stored(user.saveId)).toHaveLength(0)

    // a record claiming demo, or with an invalid value, is rejected alone
    const mixed = await upload(user.cookie, user.saveId, {
      idempotencyKey: `mixed-${randomUUID()}`,
      source: 'dxrating-json',
      records: [record(1, 1000000, { claimedSource: 'demo' }), record(2, 2000000), record(3)],
    })
    expect(mixed.body.job.counts).toMatchObject({ fetched: 3, inserted: 1, rejected: 2 })
  })

  it('rejects a deeply nested record alone and applies the rest of the chunk (raw body through the route)', async () => {
    const user = await newUser()
    const nested = `${'{"a":'.repeat(40)}1${'}'.repeat(40)}`
    const valid = record(2)
    const body = (idempotencyKey: string) =>
      `{"idempotencyKey":"${idempotencyKey}","source":"aqua-dx","trigger":"user","records":[{"sheetId":"${sheetId(1)}","achievement":${nested},"comboFlag":null,"syncFlag":null},${JSON.stringify(valid)}]}`
    const idempotencyKey = `nested-${randomUUID()}`
    const response = await api(user.cookie, 'POST', `/saves/${user.saveId}/client-imports`, body(idempotencyKey))
    expect(response.status).toBe(200)
    expect(response.body.job).toMatchObject({
      status: 'succeeded',
      counts: { fetched: 2, inserted: 1, rejected: 1 },
      // the hash covers the accepted records only
      rawPayloadSha256: canonicalSha256([valid]),
    })
    const rows = await stored(user.saveId)
    expect(rows.map((r) => [r.sheet_id, r.raw_payload_sha256])).toEqual([[sheetId(2), canonicalSha256([valid])]])

    // a replay of the same chunk hashes the same records and answers the job as it is
    const replay = await api(user.cookie, 'POST', `/saves/${user.saveId}/client-imports`, body(idempotencyKey))
    expect(replay.status).toBe(200)
    expect(replay.body).toEqual(response.body)
  })

  it('short-circuits an unchanged automatic upload', async () => {
    const user = await newUser()
    const records = [record(1), record(2)]
    const first = await upload(user.cookie, user.saveId, {
      idempotencyKey: `auto-${randomUUID()}`,
      trigger: 'auto',
      records,
    })
    const second = await upload(user.cookie, user.saveId, {
      idempotencyKey: `auto-${randomUUID()}`,
      trigger: 'auto',
      records,
    })
    expect(second.body.job.counts).toMatchObject({ fetched: 2, unchanged: 2, inserted: 0 })
    expect(second.body.revision).toBe(first.body.revision)
  })

  it('does not short-circuit past a deletion an earlier identical upload only kept by its start time', async () => {
    const user = await newUser()
    const first = await upload(user.cookie, user.saveId, {
      idempotencyKey: `auto-${randomUUID()}`,
      trigger: 'auto',
      records: [record(1, 1000000)],
    })
    const better = [record(1, 1005000)]
    // The upload's job starts, then the user deletes the record, then the upload is applied: the deletion is newer
    // than the job and stays
    const key = `auto-${randomUUID()}`
    await runDatabase((database) =>
      startImportJob(database, {
        userId: user.userId,
        saveId: user.saveId,
        source: 'aqua-dx',
        trigger: 'auto',
        idempotencyKey: key,
        fetchedAt: null,
        rawPayloadSha256: null,
      }),
    )
    const deleted = await api(user.cookie, 'POST', `/saves/${user.saveId}/mutations`, {
      mutations: [deleteMutation(sheetId(1), first.body.revision)],
    })
    expect(deleted.body.results[0].status).toBe('applied')
    const during = await upload(user.cookie, user.saveId, { idempotencyKey: key, trigger: 'auto', records: better })
    expect(during.body.job.counts).toMatchObject({ skippedDeleted: 1 })

    // The same upload again, started after the deletion: the merge runs and restores the strictly better score
    const next = await upload(user.cookie, user.saveId, {
      idempotencyKey: `auto-${randomUUID()}`,
      trigger: 'auto',
      records: better,
    })
    expect(next.body.job.counts).toMatchObject({ inserted: 1, skippedDeleted: 0 })
  })

  it('limits client imports to 10 an hour per user', async () => {
    const user = await newUser()
    for (let i = 0; i < 10; i++) {
      const response = await upload(user.cookie, user.saveId, {
        idempotencyKey: `limit-${randomUUID()}`,
        records: [record(i + 1)],
      })
      expect(response.status).toBe(200)
    }
    const limited = await upload(user.cookie, user.saveId, {
      idempotencyKey: `limit-${randomUUID()}`,
      records: [record(99)],
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
  })

  it('answers 404 on the server import routes while SERVER_IMPORTS is off', async () => {
    const user = await newUser()
    const lxns = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/lxns`, {
      idempotencyKey: `off-${randomUUID()}`,
      trigger: 'user',
    })
    expect(lxns.status).toBe(404)
    const df = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/diving-fish`, {
      idempotencyKey: `off-${randomUUID()}`,
      trigger: 'user',
      username: 'synth',
    })
    expect(df.status).toBe(404)
    const net = await api(user.cookie, 'POST', `/saves/${user.saveId}/imports/maimai-net`, {
      idempotencyKey: `off-${randomUUID()}`,
      trigger: 'user',
      region: 'jp',
      id: 'synthetic',
      password: 'synthetic',
    })
    expect(net.status).toBe(404)
    expect((await api(user.cookie, 'GET', '/me/features')).body).toMatchObject({
      cloudSave: true,
      serverImports: false,
    })
  })
})