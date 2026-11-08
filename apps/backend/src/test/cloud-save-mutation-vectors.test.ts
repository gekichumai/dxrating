import vectors from '@gekichumai/maimai-domain/test-vectors/manual-mutation.json' with { type: 'json' }
import type { MutationItemInput } from '@gekichumai/api-contract'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMutations } from '../services/cloud-save/mutations'
import { runDatabase, sheetId, testPool, uuidv7 } from './cloud-save-helpers'
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
  mutation: Record<string, unknown>
  expected: {
    status: string
    reason: string | null
    next: (VectorRecord & { deleted: boolean }) | null
    bumpRevision: boolean
    valueChanged: boolean
    liveDelta: number
    eventKind: string | null
  }
}
const cases = vectors.cases as unknown as Vector[]

const pool = testPool()
const USER = 'mutation-vector-user'
const SHEET = sheetId(42)
const VALUE_CHANGED_AT = '2026-01-01T00:00:00.000Z'

const insert = (table: string, row: Record<string, unknown>) => {
  const columns = Object.keys(row)
  return pool.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row),
  )
}

const instant = (value: string | Date | null) => (value === null ? null : new Date(value).getTime())

describe('cloud save manual mutations (shared vectors, applied to the database)', () => {
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

  it('writes exactly what every decideManualMutation vector decides', async () => {
    expect(cases.length).toBeGreaterThan(30)
    for (const [index, vector] of cases.entries()) {
      const suffix = `_m${index}`
      const mapId = (id: string | null) => (id === null ? null : `${id}${suffix}`)
      const unmapId = (id: string | null) => (id === null ? null : id.replace(suffix, ''))
      const saveId = `dsav_mv${index}`
      const existing = vector.existing
      const live = existing !== null && existing.deletedAt === null
      await insert('score_saves', {
        id: saveId,
        user_id: USER,
        name: 'vector',
        region: 'jp',
        revision: existing ? existing.revision : 0,
        record_count: live ? 1 : 0,
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
          value_changed_at: VALUE_CHANGED_AT,
          deleted_at: existing.deletedAt,
        })
      }

      const mutationId = uuidv7()
      const item = { ...vector.mutation, mutationId, sheetId: SHEET } as unknown as MutationItemInput
      const { result } = await runDatabase((database) => applyMutations(database, USER, saveId, [item]))

      const expected = vector.expected
      const context = `vector ${index}: ${vector.name}`
      const startRevision = existing ? existing.revision : 0
      const bumped = expected.status === 'applied' && expected.bumpRevision
      expect(result.results[0], context).toMatchObject({ mutationId, status: expected.status })
      if (expected.status === 'rejected') expect(result.results[0]!.reason, context).toBe(expected.reason)
      expect(result.revision, context).toBe(startRevision + (bumped ? 1 : 0))

      const { rows } = await pool.query('SELECT * FROM score_records WHERE save_id = $1', [saveId])
      const { rows: saves } = await pool.query('SELECT revision, record_count FROM score_saves WHERE id = $1', [saveId])
      const { rows: events } = await pool.query(
        'SELECT kind, client_mutation_id FROM score_record_events WHERE save_id = $1',
        [saveId],
      )
      expect(Number(saves[0].revision), context).toBe(startRevision + (bumped ? 1 : 0))
      expect(saves[0].record_count, context).toBe(
        (live ? 1 : 0) + (expected.status === 'applied' ? expected.liveDelta : 0),
      )
      expect(events, context).toEqual(
        expected.eventKind && expected.status !== 'rejected' && expected.status !== 'noop'
          ? [{ kind: expected.eventKind, client_mutation_id: mutationId }]
          : [],
      )
      const { rows: ledger } = await pool.query('SELECT result FROM score_mutations WHERE mutation_id = $1', [
        mutationId,
      ])
      expect(
        ledger.map((row) => row.result.status),
        context,
      ).toEqual([expected.status])

      const applied = expected.status === 'applied' && expected.next !== null
      const state = applied ? expected.next : existing ? { ...existing, deleted: existing.deletedAt !== null } : null
      expect(rows.length, context).toBe(state ? 1 : 0)
      if (!state) continue
      const row = rows[0]
      expect(
        {
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
            editedFromJobId: unmapId(row.edited_from_job_id),
          },
        },
        context,
      ).toEqual({
        achievement: state.achievement,
        comboFlag: state.comboFlag,
        syncFlag: state.syncFlag,
        dxScore: state.dxScore,
        best50Bucket: state.best50Bucket,
        providerRecordId: state.providerRecordId,
        deleted: state.deleted,
        provenance: { ...state.provenance, fetchedAt: instant(state.provenance.fetchedAt) },
      })
      expect(Number(row.revision), context).toBe(bumped ? startRevision + 1 : startRevision)
      expect(row.client_mutation_id, context).toBe(applied ? mutationId : null)
      if (existing) {
        expect(instant(row.value_changed_at) !== instant(VALUE_CHANGED_AT), context).toBe(
          applied && expected.valueChanged,
        )
      }
    }
  })
})