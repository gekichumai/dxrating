import vectors from '@gekichumai/maimai-domain/test-vectors/score-merge.json' with { type: 'json' }
import { Effect, Result } from 'effect'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { pullChanges } from '../services/cloud-save/changes'
import { ImportInProgress } from '../services/cloud-save/errors'
import { startImportJob } from '../services/cloud-save/jobs'
import { applyImportRecords, type MergeRecord } from '../services/cloud-save/merge'
import { completeImportJob } from '../services/cloud-save/merge'
import { applyMutations } from '../services/cloud-save/mutations'
import { lockSave } from '../services/cloud-save/saves'
import { deleteMutation, importRecords, runDatabase, sheetId, testPool } from './cloud-save-helpers'
import { cleanDatabase, setupTestServer, teardownTestServer } from './setup'

interface VectorProvenance {
  source: string
  claimedSource: string | null
  fetchedBy: string
  verification: string
  entryMethod: string
  sourceAccountId: string | null
  importJobId: string | null
  rawPayloadSha256: string | null
  fetchedAt: string | null
  editedFromJobId: string | null
}
interface VectorRecord {
  achievement: number
  comboFlag: string | null
  syncFlag: string | null
  dxScore: number | null
  best50Bucket: string | null
  providerRecordId: string | null
  provenance: VectorProvenance
}
interface Vector {
  name: string
  existing: (VectorRecord & { revision: number; deletedAt: string | null }) | null
  incoming: Record<string, unknown>
  job: {
    id: string
    source: string
    fetchedBy: string
    trigger: string
    startedAt: string
    fetchedAt: string | null
    rawPayloadSha256: string | null
    sourceAccountId: string | null
  }
  expected: {
    outcome: string
    countKey: string
    next: (VectorRecord & { deleted: boolean }) | null
    bumpRevision: boolean
    valueChanged: boolean
    liveDelta: number
    eventKind: string | null
  }
}
const cases = vectors.decideImportMerge as unknown as Vector[]

const pool = testPool()
const USER = 'merge-user'
const SHEET = sheetId(42)

const insert = (table: string, row: Record<string, unknown>) => {
  const columns = Object.keys(row)
  return pool.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row),
  )
}

const instant = (value: string | Date | null) => (value === null ? null : new Date(value).getTime())

describe('cloud save merge module (shared vectors, applied to the database)', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
    await pool.end()
  })
  beforeEach(async () => {
    await cleanDatabase()
    await insert('"user"', { id: USER, name: USER, email: `${USER}@example.invalid` })
  })

  it('writes exactly what every decideImportMerge vector decides', async () => {
    expect(cases.length).toBeGreaterThan(100)
    for (const [index, vector] of cases.entries()) {
      const suffix = `_c${index}`
      const mapId = (id: string | null) => (id === null ? null : `${id}${suffix}`)
      const unmapId = (id: string | null) => (id === null ? null : id.replace(suffix, ''))
      const saveId = `dsav_v${index}`
      const existing = vector.existing
      await insert('score_saves', {
        id: saveId,
        user_id: USER,
        name: 'vector',
        region: 'jp',
        revision: existing ? existing.revision : 0,
        record_count: existing && existing.deletedAt === null ? 1 : 0,
      })
      if (existing) {
        const provenance = existing.provenance
        if (provenance.importJobId !== null) {
          await insert('score_import_jobs', {
            id: mapId(provenance.importJobId),
            user_id: USER,
            save_id: saveId,
            source: provenance.source,
            fetched_by: provenance.fetchedBy,
            trigger: 'auto',
            idempotency_key: `prev${suffix}`,
            status: 'succeeded',
            raw_payload_sha256: provenance.rawPayloadSha256,
            fetched_at: provenance.fetchedAt,
          })
        }
        await insert('score_records', {
          save_id: saveId,
          sheet_id: SHEET,
          user_id: USER,
          achievement: existing.achievement,
          combo_flag: existing.comboFlag,
          sync_flag: existing.syncFlag,
          dx_score: existing.dxScore,
          best50_bucket: existing.best50Bucket,
          provider_record_id: existing.providerRecordId,
          source: provenance.source,
          claimed_source: provenance.claimedSource,
          fetched_by: provenance.fetchedBy,
          verification: provenance.verification,
          entry_method: provenance.entryMethod,
          source_account_id: provenance.sourceAccountId,
          import_job_id: mapId(provenance.importJobId),
          raw_payload_sha256: provenance.rawPayloadSha256,
          fetched_at: provenance.fetchedAt,
          edited_from_job_id: provenance.editedFromJobId,
          revision: existing.revision,
          value_changed_at: '2026-01-01T00:00:00.000Z',
          deleted_at: existing.deletedAt,
        })
      }
      const job = vector.job
      await insert('score_import_jobs', {
        id: mapId(job.id),
        user_id: USER,
        save_id: saveId,
        source: job.source,
        fetched_by: job.fetchedBy,
        trigger: job.trigger,
        idempotency_key: `job${suffix}`,
        status: 'running',
        started_at: job.startedAt,
        fetched_at: job.fetchedAt,
        raw_payload_sha256: job.rawPayloadSha256,
        source_account_id: job.sourceAccountId,
      })

      const incoming = vector.incoming as unknown as MergeRecord
      const result = await runDatabase((database) =>
        database.transaction(() =>
          Effect.gen(function* () {
            const save = yield* lockSave(database, USER, saveId)
            return yield* applyImportRecords(
              database,
              save,
              { ...(job as never as Parameters<typeof applyImportRecords>[2]), id: mapId(job.id)! },
              [{ ...incoming, sheetId: SHEET }],
            )
          }),
        ),
      )

      const expected = vector.expected
      const context = `vector ${index}: ${vector.name}`
      expect(result.counts[expected.countKey as keyof typeof result.counts], context).toBe(1)
      expect(result.counts.fetched, context).toBe(1)

      const { rows } = await pool.query('SELECT * FROM score_records WHERE save_id = $1', [saveId])
      const { rows: saves } = await pool.query('SELECT revision, record_count FROM score_saves WHERE id = $1', [saveId])
      const { rows: events } = await pool.query(
        'SELECT kind, import_job_id FROM score_record_events WHERE save_id = $1',
        [saveId],
      )
      const startRevision = existing ? existing.revision : 0
      expect(Number(saves[0].revision), context).toBe(startRevision + (expected.bumpRevision ? 1 : 0))
      expect(saves[0].record_count, context).toBe(
        (existing && existing.deletedAt === null ? 1 : 0) + expected.liveDelta,
      )
      expect(
        events.map((event) => event.kind),
        context,
      ).toEqual(expected.eventKind ? [expected.eventKind] : [])

      const state = expected.next ?? (existing ? { ...existing, deleted: existing.deletedAt !== null } : null)
      expect(rows.length, context).toBe(state ? 1 : 0)
      if (!state) continue
      const row = rows[0]
      const actual = {
        achievement: row.achievement,
        comboFlag: row.combo_flag,
        syncFlag: row.sync_flag,
        dxScore: row.dx_score,
        best50Bucket: row.best50_bucket,
        providerRecordId: row.provider_record_id,
        deleted: row.deleted_at !== null,
        provenance: {
          source: row.source,
          claimedSource: row.claimed_source,
          fetchedBy: row.fetched_by,
          verification: row.verification,
          entryMethod: row.entry_method,
          sourceAccountId: row.source_account_id,
          importJobId: unmapId(row.import_job_id),
          rawPayloadSha256: row.raw_payload_sha256,
          fetchedAt: instant(row.fetched_at),
          editedFromJobId: row.edited_from_job_id,
        },
      }
      const provenance = state.provenance
      expect(actual, context).toEqual({
        achievement: state.achievement,
        comboFlag: state.comboFlag,
        syncFlag: state.syncFlag,
        dxScore: state.dxScore,
        best50Bucket: state.best50Bucket,
        providerRecordId: state.providerRecordId,
        deleted: state.deleted,
        provenance: { ...provenance, fetchedAt: instant(provenance.fetchedAt) },
      })
      expect(Number(row.revision), context).toBe(expected.bumpRevision ? startRevision + 1 : startRevision)
      const valueMoved = instant(row.value_changed_at) !== instant('2026-01-01T00:00:00.000Z')
      if (existing) expect(valueMoved, context).toBe(expected.valueChanged)
    }
  })

  it('pages a 2500-record import at 1000 per page: every record exactly once', async () => {
    await insert('score_saves', { id: 'dsav_cursor', user_id: USER, name: 'cursor', region: 'jp' })
    const records = Array.from({ length: 2500 }, (_, i) => ({
      sheetId: sheetId(i),
      achievement: 900000 + i,
      comboFlag: null,
      syncFlag: null,
    }))
    const { job, revision } = await importRecords(USER, 'dsav_cursor', 'dxrating-json', records)
    expect(revision).toBe(2500)
    expect(job.counts).toMatchObject({ fetched: 2500, inserted: 2500 })

    const seen: string[] = []
    const revisions: number[] = []
    let since = 0
    let pages = 0
    for (;;) {
      const page = await runDatabase((database) => pullChanges(database, USER, 'dsav_cursor', since, 1000))
      pages += 1
      expect(page.resetRequired).toBe(false)
      seen.push(...page.records.map((record) => record.sheetId))
      revisions.push(...page.records.map((record) => record.revision))
      since = page.nextSince
      if (!page.hasMore) {
        expect(page.checksum).toEqual({
          count: 2500,
          sumAchievement: records.reduce((sum, record) => sum + record.achievement, 0),
        })
        break
      }
      expect(page.checksum).toBeNull()
    }
    expect(pages).toBe(3)
    expect(seen).toHaveLength(2500)
    expect(new Set(seen).size).toBe(2500)
    expect(revisions).toEqual(Array.from({ length: 2500 }, (_, i) => i + 1))
    const { rows } = await pool.query(
      `SELECT count(*)::integer AS n, count(DISTINCT revision)::integer AS revisions FROM score_records
       WHERE save_id = 'dsav_cursor'`,
    )
    expect(rows[0]).toEqual({ n: 2500, revisions: 2500 })
  })

  it('short-circuits an automatic job whose payload hash matches the last success', async () => {
    await insert('score_saves', { id: 'dsav_hash', user_id: USER, name: 'hash', region: 'jp' })
    const records = [1, 2, 3].map((n) => ({
      sheetId: sheetId(n),
      achievement: 1000000,
      comboFlag: null,
      syncFlag: null,
    }))
    const first = await importRecords(USER, 'dsav_hash', 'lxns', records, {
      trigger: 'auto',
      sourceAccountId: 'friend-1',
      sha: 'b'.repeat(64),
    })
    expect(first.job.counts).toMatchObject({ inserted: 3 })
    const eventsBefore = await pool.query(`SELECT count(*)::integer AS n FROM score_record_events`)

    const changed = records.map((record) => ({ ...record, achievement: 1005000 }))
    const second = await importRecords(USER, 'dsav_hash', 'lxns', changed, {
      trigger: 'auto',
      sourceAccountId: 'friend-1',
      sha: 'b'.repeat(64),
    })
    expect(second.job.status).toBe('succeeded')
    expect(second.job.counts).toMatchObject({ fetched: 3, unchanged: 3, inserted: 0, improved: 0 })
    expect(second.revision).toBe(first.revision)
    expect((await pool.query(`SELECT count(*)::integer AS n FROM score_record_events`)).rows).toEqual(eventsBefore.rows)

    // another account, or a user-started import, merges as usual
    const otherAccount = await importRecords(USER, 'dsav_hash', 'lxns', changed, {
      trigger: 'auto',
      sourceAccountId: 'friend-2',
      sha: 'b'.repeat(64),
    })
    expect(otherAccount.job.counts).toMatchObject({ improved: 3 })

    // the user deletes a record; the same payload again: the save changed since the last job, so an automatic job
    // merges, and the deletion stays (§5.3 rule 2); a user-started one merges and revives it
    const deleted = await runDatabase((database) =>
      applyMutations(database, USER, 'dsav_hash', [deleteMutation(sheetId(2), otherAccount.revision)]),
    )
    expect(deleted.result.results[0]!.status).toBe('applied')
    const auto = await importRecords(USER, 'dsav_hash', 'lxns', changed, {
      trigger: 'auto',
      sourceAccountId: 'friend-2',
      sha: 'b'.repeat(64),
    })
    expect(auto.job.counts).toMatchObject({ fetched: 3, unchanged: 2, inserted: 0, skippedDeleted: 1 })
    expect(auto.revision).toBe(deleted.result.revision)
    const tombstone = await pool.query(
      `SELECT deleted_at IS NOT NULL AS deleted FROM score_records WHERE save_id = 'dsav_hash' AND sheet_id = $1`,
      [sheetId(2)],
    )
    expect(tombstone.rows).toEqual([{ deleted: true }])

    const user = await importRecords(USER, 'dsav_hash', 'lxns', changed, {
      trigger: 'user',
      sourceAccountId: 'friend-2',
      sha: 'b'.repeat(64),
    })
    expect(user.job.counts).toMatchObject({ fetched: 3, inserted: 1, unchanged: 2 })
    expect(user.revision).toBe(deleted.result.revision + 1)
    const revived = await pool.query(
      `SELECT revision, deleted_at FROM score_records WHERE save_id = 'dsav_hash' AND sheet_id = $1`,
      [sheetId(2)],
    )
    expect(revived.rows).toEqual([{ revision: String(user.revision), deleted_at: null }])
    const lastEvent = await pool.query(
      `SELECT kind, import_job_id FROM score_record_events WHERE save_id = 'dsav_hash' AND sheet_id = $1
       ORDER BY id DESC LIMIT 1`,
      [sheetId(2)],
    )
    expect(lastEvent.rows).toEqual([{ kind: 'import_applied', import_job_id: user.job.id }])
    const saves = await pool.query(`SELECT record_count FROM score_saves WHERE id = 'dsav_hash'`)
    expect(saves.rows).toEqual([{ record_count: 3 }])
  })

  it('allows one running job per save and source (409 helper) and replays idempotency keys', async () => {
    await insert('score_saves', { id: 'dsav_jobs', user_id: USER, name: 'jobs', region: 'jp' })
    const start = (key: string, source: 'lxns' | 'diving-fish' = 'lxns') =>
      runDatabase((database) =>
        startImportJob(database, {
          userId: USER,
          saveId: 'dsav_jobs',
          source,
          trigger: 'user',
          idempotencyKey: key,
        }).pipe(Effect.result),
      )
    const first = await start('key-00000001')
    expect(Result.isSuccess(first)).toBe(true)
    const firstJob = Result.isSuccess(first) ? first.success.job : null
    const conflict = await start('key-00000002')
    expect(Result.isFailure(conflict)).toBe(true)
    if (Result.isFailure(conflict)) {
      expect(conflict.failure).toBeInstanceOf(ImportInProgress)
      expect(conflict.failure instanceof ImportInProgress ? conflict.failure.jobId : null).toBe(firstJob!.id)
    }
    const replay = await start('key-00000001')
    expect(Result.isSuccess(replay) && replay.success.replayed).toBe(true)
    expect(Result.isSuccess(replay) && replay.success.job.id).toBe(firstJob!.id)
    const otherSource = await start('key-00000003', 'diving-fish')
    expect(Result.isSuccess(otherSource)).toBe(true)
  })

  it('keeps deletions sticky against automatic imports of old data', async () => {
    await insert('score_saves', { id: 'dsav_sticky', user_id: USER, name: 'sticky', region: 'jp' })
    const value = (n: number, achievement: number) => ({
      sheetId: sheetId(n),
      achievement,
      comboFlag: null,
      syncFlag: null,
    })
    const state = async () => {
      const { rows: saves } = await pool.query(
        `SELECT revision, record_count FROM score_saves WHERE id = 'dsav_sticky'`,
      )
      const { rows } = await pool.query(
        `SELECT sheet_id, revision, deleted_at IS NOT NULL AS deleted FROM score_records WHERE save_id = 'dsav_sticky'
         ORDER BY sheet_id`,
      )
      return {
        revision: Number(saves[0].revision),
        recordCount: saves[0].record_count as number,
        records: rows.map((row) => ({ sheetId: row.sheet_id, revision: Number(row.revision), deleted: row.deleted })),
      }
    }
    const imported = await importRecords(
      USER,
      'dsav_sticky',
      'lxns',
      [value(1, 1000000), value(2, 1000000), value(3, 1000000)],
      { trigger: 'auto' },
    )
    // the user deletes all three through the mutation path (tombstones keep the deleted value)
    const deleted = await runDatabase((database) =>
      applyMutations(
        database,
        USER,
        'dsav_sticky',
        [1, 2, 3].map((n) => deleteMutation(sheetId(n), imported.revision)),
      ),
    )
    expect(deleted.result.results.map((result) => result.status)).toEqual(['applied', 'applied', 'applied'])
    expect(await state()).toEqual({
      revision: 6,
      recordCount: 0,
      records: [1, 2, 3].map((n) => ({ sheetId: sheetId(n), revision: 3 + n, deleted: true })),
    })

    const auto = await importRecords(USER, 'dsav_sticky', 'lxns', [value(1, 1000000), value(2, 990000)], {
      trigger: 'auto',
      sha: 'c'.repeat(64),
    })
    expect(auto.job.counts).toMatchObject({ skippedDeleted: 2, inserted: 0 })
    expect(auto.revision).toBe(6)
    const better = await importRecords(USER, 'dsav_sticky', 'lxns', [value(2, 1001000)], {
      trigger: 'auto',
      sha: 'd'.repeat(64),
    })
    expect(better.job.counts).toMatchObject({ inserted: 1 })
    const user = await importRecords(USER, 'dsav_sticky', 'lxns', [value(1, 1000000)], {
      trigger: 'user',
      sha: 'e'.repeat(64),
    })
    expect(user.job.counts).toMatchObject({ inserted: 1 })
    // each revival takes a new revision and counts as live again
    expect(await state()).toEqual({
      revision: 8,
      recordCount: 2,
      records: [
        { sheetId: sheetId(1), revision: 8, deleted: false },
        { sheetId: sheetId(2), revision: 7, deleted: false },
        { sheetId: sheetId(3), revision: 6, deleted: true },
      ],
    })

    // a deletion while the job ran wins even over a user import: the job starts, then the user deletes
    const { job } = await runDatabase((database) =>
      startImportJob(database, {
        userId: USER,
        saveId: 'dsav_sticky',
        source: 'lxns',
        trigger: 'user',
        idempotencyKey: 'sticky-running',
        fetchedAt: new Date(),
        rawPayloadSha256: 'f'.repeat(64),
      }),
    )
    const during = await runDatabase((database) =>
      applyMutations(database, USER, 'dsav_sticky', [deleteMutation(sheetId(1), 8)]),
    )
    expect(during.result.results[0]!.status).toBe('applied')
    const completed = await runDatabase((database) =>
      completeImportJob(database, { userId: USER, saveId: 'dsav_sticky', jobId: job.id, records: [value(1, 1010000)] }),
    )
    expect(completed.job.counts).toMatchObject({ skippedDeleted: 1 })
    expect(await state()).toEqual({
      revision: 9,
      recordCount: 1,
      records: [
        { sheetId: sheetId(1), revision: 9, deleted: true },
        { sheetId: sheetId(2), revision: 7, deleted: false },
        { sheetId: sheetId(3), revision: 6, deleted: true },
      ],
    })
  })
})