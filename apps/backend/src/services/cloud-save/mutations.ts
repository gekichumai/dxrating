import {
  MutationSchema,
  type MutationItemInput,
  type MutationResultDTO,
  type MutationsResultDTO,
} from '@gekichumai/api-contract'
import {
  decideManualMutation,
  isPublicSheetId,
  manualVerification,
  type ManualMutation,
  type ManualMutationStatus,
} from '@gekichumai/maimai-domain'
import { Effect } from 'effect'
import type { Database } from '../../db/index'
import { RecordWriter, toExistingRecord, toRecordDTO } from './records'
import { lockSave, saveTransaction } from './saves'

type DatabaseService = typeof Database.Service

/** Why a mutation was `rejected`: the domain's reasons plus the shape checks of the route */
export type MutationRejection =
  | 'invalid-mutation-id'
  | 'invalid-sheet-id'
  | 'invalid-value'
  | 'invalid-achievement'
  | 'invalid-combo-flag'
  | 'invalid-sync-flag'
  | 'invalid-dx-score'
  | 'invalid-entry-method'
  | 'invalid-based-on-revision'
  | 'invalid-client-edited-at'
  | 'invalid-mutation'
  /** A new chart, and the save already stores `CLOUD_SAVE_MAX_RECORDS_PER_SAVE` records */
  | 'record-limit'

const VALUE_REJECTIONS: Record<string, MutationRejection> = {
  achievement: 'invalid-achievement',
  comboFlag: 'invalid-combo-flag',
  syncFlag: 'invalid-sync-flag',
  dxScore: 'invalid-dx-score',
}
const FIELD_REJECTIONS: Record<string, MutationRejection> = {
  mutationId: 'invalid-mutation-id',
  sheetId: 'invalid-sheet-id',
  value: 'invalid-value',
  entryMethod: 'invalid-entry-method',
  basedOnRevision: 'invalid-based-on-revision',
  clientEditedAt: 'invalid-client-edited-at',
}

type ParsedMutation =
  | { ok: true; mutation: ReturnType<typeof MutationSchema.parse> }
  | { ok: false; reason: MutationRejection }

/**
 * Validates one loose mutation item with the strict `MutationSchema` (§5.4: a malformed item is that item's
 * `rejected`, never a 400 for the batch). Missing combo and sync flags of a `set` mean none (`null`).
 */
export function parseMutation(item: MutationItemInput): ParsedMutation {
  const candidate =
    item.op === 'set' && typeof item.value === 'object' && item.value !== null && !Array.isArray(item.value)
      ? {
          ...item,
          value: { ...item.value, comboFlag: item.value.comboFlag ?? null, syncFlag: item.value.syncFlag ?? null },
        }
      : item
  const result = MutationSchema.safeParse(candidate)
  if (!result.success) {
    const path = result.error.issues[0]?.path ?? []
    const [field, nested] = path.map(String)
    const reason =
      (field === 'value' && nested !== undefined ? VALUE_REJECTIONS[nested] : undefined) ??
      (field !== undefined ? FIELD_REJECTIONS[field] : undefined) ??
      'invalid-mutation'
    return { ok: false, reason }
  }
  if (!isPublicSheetId(result.data.sheetId)) return { ok: false, reason: 'invalid-sheet-id' }
  return { ok: true, mutation: result.data }
}

export interface MutationBatchStats {
  statuses: Record<ManualMutationStatus, number>
  replayed: number
}

/**
 * Applies a batch of manual mutations to a save (§5.4, §5.5), in one transaction holding the save `FOR UPDATE`.
 *
 * - A mutation ID found in the `score_mutations` ledger (or earlier in the batch) returns the stored result; nothing
 *   is applied again.
 * - Every other item is validated, then decided with `decideManualMutation` against the record as the batch has
 *   left it, in order. Applied changes take the next revision; `superseded` returns the current record and logs a
 *   `superseded` event with the value the user tried to set.
 * - Each new result is stored in the ledger, including rejections, so a retry answers the same.
 */
export const applyMutations = (
  database: DatabaseService,
  userId: string,
  saveId: string,
  items: readonly MutationItemInput[],
) =>
  saveTransaction(database, () =>
    Effect.gen(function* () {
      const save = yield* lockSave(database, userId, saveId)
      // The ledger is per user, not per save: batches of the user's other saves wait here, so the ledger read below
      // sees every committed result and the ledger insert never waits on (or silently loses to) a concurrent batch
      yield* database.raw(
        'CloudSave.lockMutationLedger',
        `SELECT pg_advisory_xact_lock(hashtext('cloudsave:mutations:' || $1))`,
        [userId],
      )
      const { rows: ledger } = yield* database.raw<{ mutation_id: string; result: MutationResultDTO }>(
        'CloudSave.readMutationLedger',
        `SELECT mutation_id, result FROM score_mutations WHERE user_id = $1 AND mutation_id = ANY($2::text[])`,
        [userId, [...new Set(items.map((item) => item.mutationId))]],
      )
      const known = new Map(ledger.map((row) => [row.mutation_id, row.result]))

      const parsed = items.map(parseMutation)
      const writer = new RecordWriter(database, save)
      yield* writer.load(parsed.flatMap((entry) => (entry.ok ? [entry.mutation.sheetId] : [])))
      yield* writer.loadStoredCount()

      const stats: MutationBatchStats = {
        statuses: { applied: 0, superseded: 0, noop: 0, rejected: 0 },
        replayed: 0,
      }
      const results: MutationResultDTO[] = []
      const fresh: MutationResultDTO[] = []
      items.forEach((item, index) => {
        const stored = known.get(item.mutationId)
        if (stored) {
          stats.replayed += 1
          results.push(stored)
          return
        }
        const result = decide(writer, item.mutationId, parsed[index]!)
        stats.statuses[result.status] += 1
        known.set(item.mutationId, result)
        results.push(result)
        fresh.push(result)
      })

      yield* writer.finish()
      if (fresh.length > 0) {
        yield* database.raw(
          'CloudSave.writeMutationLedger',
          `INSERT INTO score_mutations (user_id, mutation_id, save_id, result, created_at)
           SELECT $1, m.mutation_id, $2, m.result, $3
           FROM jsonb_to_recordset($4::jsonb) AS m(mutation_id text, result jsonb)
           ON CONFLICT (user_id, mutation_id) DO NOTHING`,
          [
            userId,
            save.id,
            save.now,
            JSON.stringify(fresh.map((result) => ({ mutation_id: result.mutationId, result }))),
          ],
        )
      }
      return { result: { revision: save.revision, results } satisfies MutationsResultDTO, stats }
    }),
  )

function decide(writer: RecordWriter, mutationId: string, parsed: ParsedMutation): MutationResultDTO {
  if (!parsed.ok) return { mutationId, status: 'rejected', record: null, reason: parsed.reason }
  const { mutation } = parsed
  const before = writer.get(mutation.sheetId)
  const manual: ManualMutation =
    mutation.op === 'set'
      ? {
          op: 'set',
          basedOnRevision: mutation.basedOnRevision,
          value: mutation.value,
          entryMethod: mutation.entryMethod,
        }
      : { op: 'delete', basedOnRevision: mutation.basedOnRevision }
  const decision = decideManualMutation(before === null ? null : toExistingRecord(before), manual)
  const current = before === null ? null : toRecordDTO(before)

  switch (decision.status) {
    case 'rejected':
      return { mutationId, status: 'rejected', record: null, reason: decision.reason }
    case 'noop':
      return { mutationId, status: 'noop', record: current, reason: null }
    case 'superseded': {
      if (mutation.op === 'set') {
        writer.addEvent({
          sheetId: mutation.sheetId,
          kind: 'superseded',
          achievement: mutation.value.achievement,
          comboFlag: mutation.value.comboFlag,
          syncFlag: mutation.value.syncFlag,
          dxScore: null,
          best50Bucket: null,
          source: 'manual',
          claimedSource: null,
          fetchedBy: 'client',
          verification: manualVerification(before === null ? null : toExistingRecord(before)).verification,
          entryMethod: mutation.entryMethod,
          sourceAccountId: null,
          importJobId: null,
          rawPayloadSha256: null,
          fetchedAt: null,
          clientMutationId: mutationId,
        })
      } else {
        // A superseded delete has no value of its own: log the record it would have deleted
        writer.addEvent({
          ...eventFields(before!),
          sheetId: mutation.sheetId,
          kind: 'superseded',
          clientMutationId: mutationId,
        })
      }
      return { mutationId, status: 'superseded', record: current, reason: null }
    }
    case 'applied': {
      if (before === null && writer.remainingCapacity() === 0) {
        return { mutationId, status: 'rejected', record: null, reason: 'record-limit' }
      }
      const state = writer.apply(mutation.sheetId, {
        before,
        next: decision.next!,
        bumpRevision: decision.bumpRevision,
        valueChanged: decision.valueChanged,
        liveDelta: decision.liveDelta,
        eventKind: decision.eventKind,
        clientMutationId: mutationId,
        clientEditedAt: mutation.clientEditedAt ? new Date(mutation.clientEditedAt) : null,
      })
      return { mutationId, status: 'applied', record: toRecordDTO(state), reason: null }
    }
  }
}

function eventFields(state: NonNullable<ReturnType<RecordWriter['get']>>) {
  return {
    achievement: state.achievement,
    comboFlag: state.comboFlag,
    syncFlag: state.syncFlag,
    dxScore: state.dxScore,
    best50Bucket: state.best50Bucket,
    source: state.provenance.source,
    claimedSource: state.provenance.claimedSource,
    fetchedBy: state.provenance.fetchedBy,
    verification: state.provenance.verification,
    entryMethod: state.provenance.entryMethod,
    sourceAccountId: state.provenance.sourceAccountId,
    importJobId: state.provenance.importJobId,
    rawPayloadSha256: state.provenance.rawPayloadSha256,
    fetchedAt: state.provenance.fetchedAt,
  }
}