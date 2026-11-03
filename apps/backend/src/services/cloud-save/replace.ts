import {
  ImportRecordSchema,
  type ImportCountsDTO,
  type ImportRecord,
  type ImportRecordInput,
  type ImportResultDTO,
} from '@gekichumai/api-contract'
import {
  compareScore,
  importProvenance,
  isPublicSheetId,
  type ClientImportSource,
  type NextScoreRecord,
} from '@gekichumai/maimai-domain'
import { Effect } from 'effect'
import type { Database } from '../../db/index'
import { RevisionPreconditionFailed } from './errors'
import { canonicalSha256, EMPTY_COUNTS, finishImportJob, startImportJob, toImportJobDTO, toMergeJob } from './jobs'
import { RecordWriter, type RecordState } from './records'
import { lockSave } from './saves'

type DatabaseService = typeof Database.Service

export interface ReplaceInput {
  ifRevision: number
  idempotencyKey: string
  source: ClientImportSource
  records: readonly ImportRecordInput[]
}

/**
 * Replaces every record of a save with an uploaded document (§5.1 `replace`), after the user explicitly confirmed.
 *
 * One transaction holding the save `FOR UPDATE`:
 * 1. A job already created with this idempotency key is a replay: it is returned with the save's revision, nothing
 *    is applied (checked first, as a successful replace changed the revision).
 * 2. `ifRevision` must equal the save's revision (`RevisionPreconditionFailed`, 412).
 * 3. A client job is created (`fetched_by='client'`, the request's source, trigger `user`); a running job of the same
 *    source on the save is `ImportInProgress`.
 * 4. Every valid record becomes the save's value with the job's `client_reported` provenance, whatever was stored
 *    (better, worse or verified); a sheet listed twice keeps its best entry. A live record with the same values and
 *    the same client source and claim stays as it is (`unchanged`).
 * 5. Every live record not in the payload becomes a tombstone (`delete` event), except records of a sheet the payload
 *    listed with invalid values (`rejected`): those are left alone rather than deleted because of a typo.
 *
 * Counts (replace semantics, not merge outcomes): `inserted` (new or revived), `improved` (any live record rewritten,
 * with a better, worse or the same value), `unchanged`, `rejected`; never `provenanceUpgraded`, as a replace never
 * raises the verification. Every rewrite logs `import_applied`. Deletions are not counted; the revision shows them.
 */
export const replaceRecords = (database: DatabaseService, userId: string, saveId: string, input: ReplaceInput) =>
  database.transaction(() =>
    Effect.gen(function* () {
      const save = yield* lockSave(database, userId, saveId)

      const valid = new Map<string, ImportRecord>()
      const rejectedSheets = new Set<string>()
      let rejected = 0
      for (const item of input.records) {
        const parsed = ImportRecordSchema.safeParse(item)
        if (!parsed.success || !isPublicSheetId(parsed.data.sheetId)) {
          rejected += 1
          rejectedSheets.add(item.sheetId)
          continue
        }
        const previous = valid.get(parsed.data.sheetId)
        if (!previous || compareScore(parsed.data, previous) > 0) valid.set(parsed.data.sheetId, parsed.data)
      }

      const started = yield* startImportJob(database, {
        userId,
        saveId: save.id,
        source: input.source,
        trigger: 'user',
        idempotencyKey: input.idempotencyKey,
        rawPayloadSha256: canonicalSha256(input.records),
      })
      if (started.replayed) {
        return { job: toImportJobDTO(started.job), revision: save.revision } satisfies ImportResultDTO
      }
      if (input.ifRevision !== save.revision) {
        return yield* new RevisionPreconditionFailed({ revision: save.revision })
      }

      const job = toMergeJob(started.job)
      const counts: ImportCountsDTO = { ...EMPTY_COUNTS, fetched: input.records.length, rejected }
      const writer = new RecordWriter(database, save)
      yield* writer.loadAll()

      for (const record of valid.values()) {
        const before = writer.find(record.sheetId)
        const next: NextScoreRecord = {
          achievement: record.achievement,
          comboFlag: record.comboFlag,
          syncFlag: record.syncFlag,
          dxScore: record.dxScore ?? null,
          best50Bucket: record.best50Bucket ?? null,
          providerRecordId: record.providerRecordId ?? null,
          provenance: importProvenance(job, record),
          deleted: false,
        }
        const live = before !== null && before.deletedAt === null
        if (live && sameUpload(before, next)) {
          counts.unchanged += 1
          continue
        }
        const valueChanged = !live || !sameValue(before, next)
        // A replace never raises the verification (everything becomes client_reported): a same-value rewrite is an
        // overwrite like any other, not a provenance upgrade
        counts[live ? 'improved' : 'inserted'] += 1
        writer.apply(record.sheetId, {
          before,
          next,
          bumpRevision: true,
          valueChanged,
          liveDelta: live ? 0 : 1,
          eventKind: 'import_applied',
        })
      }

      for (const state of writer.loaded()) {
        if (state.deletedAt !== null || valid.has(state.sheetId) || rejectedSheets.has(state.sheetId)) continue
        writer.apply(state.sheetId, {
          before: state,
          next: { ...fieldsOf(state), deleted: true },
          bumpRevision: true,
          valueChanged: false,
          liveDelta: -1,
          eventKind: 'delete',
          // the replace deleted it, not the manual edit that last set it
          clientMutationId: null,
        })
      }

      yield* writer.finish()
      const finished = yield* finishImportJob(database, started.job.id, { status: 'succeeded', counts })
      return { job: toImportJobDTO(finished!), revision: save.revision } satisfies ImportResultDTO
    }),
  )

function fieldsOf(state: RecordState): Omit<NextScoreRecord, 'deleted'> {
  return {
    achievement: state.achievement,
    comboFlag: state.comboFlag,
    syncFlag: state.syncFlag,
    dxScore: state.dxScore,
    best50Bucket: state.best50Bucket,
    providerRecordId: state.providerRecordId,
    provenance: { ...state.provenance },
  }
}

function sameValue(state: RecordState, next: NextScoreRecord): boolean {
  return (
    state.achievement === next.achievement &&
    state.comboFlag === next.comboFlag &&
    state.syncFlag === next.syncFlag &&
    state.dxScore === next.dxScore &&
    state.best50Bucket === next.best50Bucket &&
    state.providerRecordId === next.providerRecordId
  )
}

/** Same values, already `client_reported` from the same source and claim: nothing to rewrite */
function sameUpload(state: RecordState, next: NextScoreRecord): boolean {
  return (
    sameValue(state, next) &&
    state.provenance.verification === 'client_reported' &&
    state.provenance.source === next.provenance.source &&
    state.provenance.claimedSource === next.provenance.claimedSource
  )
}