import { isAchievementInt } from './achievement.ts'
import {
  fetchedByForSource,
  isServerImportSource,
  MANUAL_ENTRY_METHODS,
  type EntryMethod,
  type ImportSource,
  type ImportTrigger,
  type ManualEntryMethod,
  type Provenance,
  type FetchedBy,
  type Verification,
} from './score-provenance.ts'
import type { Best50Bucket, ComboFlag, SyncFlag } from './types'

/**
 * Pure merge decisions for cloud-save score records (meta#17, design §5.3 / §5.4). The backend, Web and iOS run
 * the same rules; `test-vectors/*.json` pin them down for every implementation.
 *
 * Achievements are integers in 1/10000 % (see `achievement.ts`). Timestamps are ISO 8601 strings.
 */

const COMBO_RANK: Record<NonNullable<ComboFlag>, number> = { fc: 1, fcp: 2, ap: 3, app: 4 }
const SYNC_RANK: Record<NonNullable<SyncFlag>, number> = { sync: 1, fs: 2, fsp: 3, fsd: 4, fsdp: 5 }
const VERIFICATION_RANK: Record<Verification, number> = { client_reported: 1, user_edited: 1, verified: 2 }

/** The values two scores of one chart are compared by */
export interface ScoreValue {
  /** Integer, 1/10000 % */
  achievement: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
}

export function comboFlagRank(flag: ComboFlag | undefined): number {
  return flag ? COMBO_RANK[flag] : 0
}

export function syncFlagRank(flag: SyncFlag | undefined): number {
  return flag ? SYNC_RANK[flag] : 0
}

/**
 * Orders two scores of the same chart: achievement first, then combo (none < fc < fcp < ap < app), then sync
 * (none < sync < fs < fsp < fsd < fsdp). Returns -1, 0 or 1.
 */
export function compareScore(a: ScoreValue, b: ScoreValue): -1 | 0 | 1 {
  return (
    sign(a.achievement - b.achievement) ||
    sign(comboFlagRank(a.comboFlag) - comboFlagRank(b.comboFlag)) ||
    sign(syncFlagRank(a.syncFlag) - syncFlagRank(b.syncFlag))
  )
}

/** Whether `a` is strictly better than `b` under {@link compareScore} */
export function isStrictlyBetterScore(a: ScoreValue, b: ScoreValue): boolean {
  return compareScore(a, b) > 0
}

/** Value and provenance of a record (a `score_records` row without its key and sync columns) */
export interface ScoreRecordFields {
  achievement: number
  comboFlag: ComboFlag
  syncFlag: SyncFlag
  dxScore: number | null
  best50Bucket: Best50Bucket | null
  providerRecordId: string | null
  provenance: Provenance
}

/** A stored record as the merge sees it */
export interface ExistingScoreRecord extends ScoreRecordFields {
  revision: number
  /** Set on tombstones; a tombstone keeps the value it had when deleted */
  deletedAt: string | null
}

/** The record state a decision leaves behind; `deleted` makes it a tombstone */
export interface NextScoreRecord extends ScoreRecordFields {
  deleted: boolean
}

/** One record of an import payload (`ImportRecord`, §5.1) */
export interface IncomingScoreRecord {
  achievement: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
  dxScore?: number | null
  best50Bucket?: Best50Bucket | null
  providerRecordId?: string | null
  /** Provider a client upload claims; ignored for server jobs */
  claimedSource?: string | null
}

/** The import job a record arrives with */
export interface ScoreImportJob {
  id: string
  source: ImportSource
  fetchedBy: FetchedBy
  trigger: ImportTrigger
  /** Server clock */
  startedAt: string
  /** Server clock for server jobs, client-claimed for client jobs; required for server jobs */
  fetchedAt?: string | null
  /** Required for server jobs */
  rawPayloadSha256?: string | null
  sourceAccountId?: string | null
}

export const IMPORT_MERGE_OUTCOMES = [
  'inserted',
  'revived',
  'improved',
  'provenanceUpgraded',
  'unchanged',
  'keptUserEdit',
  'skippedDeleted',
] as const
export type ImportMergeOutcome = (typeof IMPORT_MERGE_OUTCOMES)[number]

/** Keys of `score_import_jobs.counts` a merge outcome counts towards */
export type ImportCountKey = Exclude<ImportMergeOutcome, 'revived'>

export type ScoreRecordEventKind =
  | 'import_applied'
  | 'provenance_upgraded'
  | 'manual_set'
  | 'delete'
  | 'restore'
  | 'superseded'

export interface ImportMergeDecision {
  outcome: ImportMergeOutcome
  /** `revived` counts as `inserted` */
  countKey: ImportCountKey
  /** The record after the merge; `null` when nothing is written */
  next: NextScoreRecord | null
  /** Whether the row gets a new revision (and so reaches clients); writes without a bump are silent refreshes */
  bumpRevision: boolean
  /** Whether `value_changed_at` moves */
  valueChanged: boolean
  /** Change in the save's live record count */
  liveDelta: 0 | 1
  eventKind: Extract<ScoreRecordEventKind, 'import_applied' | 'provenance_upgraded'> | null
}

/**
 * Merges one incoming import record into the stored record of the same chart (§5.3).
 *
 * - No record: insert.
 * - Tombstone: skipped when deleted at or after the job started; otherwise revived only when the incoming score is
 *   strictly better than the value the tombstone kept, or the job was started by the user (`trigger = 'user'`).
 * - Live record: a strictly better score replaces value and provenance (even a `user_edited` one). An equal score
 *   upgrades a non-`user_edited` record's provenance when its verification ranks higher, silently refreshes the
 *   job reference of a same-source `verified` record, and backfills a missing `dxScore` / `providerRecordId`
 *   (except into `user_edited` records). Anything else keeps the stored record.
 * - Diving-Fish jobs always refresh `best50Bucket` of a live non-manual record that is not replaced, as a
 *   revision-bumping provenance-only update.
 *
 * Throws on an inconsistent job (a source/`fetchedBy` mismatch, or a server job without hash or fetch time):
 * those are programming errors, never user input.
 */
export function decideImportMerge(
  existing: ExistingScoreRecord | null,
  incoming: IncomingScoreRecord,
  job: ScoreImportJob,
): ImportMergeDecision {
  assertJob(job)
  if (!isAchievementInt(incoming.achievement)) {
    throw new RangeError(`Incoming achievement must be an integer in 0..1010000: ${String(incoming.achievement)}`)
  }

  const replacement = (): NextScoreRecord => ({
    achievement: incoming.achievement,
    comboFlag: incoming.comboFlag ?? null,
    syncFlag: incoming.syncFlag ?? null,
    dxScore: incoming.dxScore ?? null,
    best50Bucket: incoming.best50Bucket ?? null,
    providerRecordId: incoming.providerRecordId ?? null,
    provenance: importProvenance(job, incoming),
    deleted: false,
  })

  if (existing === null) {
    return applied('inserted', replacement())
  }

  if (existing.deletedAt !== null) {
    if (toEpoch(existing.deletedAt) >= toEpoch(job.startedAt)) return kept('skippedDeleted')
    if (isStrictlyBetterScore(incoming, existing) || job.trigger === 'user') return applied('revived', replacement())
    return kept('skippedDeleted')
  }

  const comparison = compareScore(incoming, existing)
  if (comparison > 0) return applied('improved', replacement())

  const current = fieldsOf(existing)
  const incomingVerification = verificationForFetchedBy(job.fetchedBy)
  const isUserEdited = existing.provenance.verification === 'user_edited'

  let outcome: ImportMergeOutcome = isUserEdited ? 'keptUserEdit' : 'unchanged'
  let next: NextScoreRecord = current
  let bumpRevision = false

  if (comparison === 0 && !isUserEdited) {
    if (VERIFICATION_RANK[incomingVerification] > VERIFICATION_RANK[existing.provenance.verification]) {
      outcome = 'provenanceUpgraded'
      bumpRevision = true
      next = {
        ...next,
        provenance: importProvenance(job, incoming),
        best50Bucket: incoming.best50Bucket ?? next.best50Bucket,
      }
    } else if (
      existing.provenance.verification === 'verified' &&
      incomingVerification === 'verified' &&
      existing.provenance.source === job.source
    ) {
      next = {
        ...next,
        provenance: {
          ...next.provenance,
          importJobId: job.id,
          fetchedAt: job.fetchedAt ?? null,
          rawPayloadSha256: job.rawPayloadSha256 ?? null,
        },
      }
    }

    next = {
      ...next,
      dxScore: next.dxScore ?? incoming.dxScore ?? null,
      providerRecordId: next.providerRecordId ?? incoming.providerRecordId ?? null,
    }
  }

  if (
    job.source === 'diving-fish' &&
    existing.provenance.source !== 'manual' &&
    incoming.best50Bucket != null &&
    incoming.best50Bucket !== next.best50Bucket
  ) {
    next = { ...next, best50Bucket: incoming.best50Bucket }
    bumpRevision = true
    if (outcome === 'unchanged') outcome = 'provenanceUpgraded'
  }

  const written = !sameFields(next, current)
  return {
    outcome,
    countKey: countKeyOf(outcome),
    next: written ? next : null,
    bumpRevision,
    valueChanged: false,
    liveDelta: 0,
    eventKind: bumpRevision ? 'provenance_upgraded' : null,
  }
}

/** The provenance an import job gives the records it writes (§4.5) */
export function importProvenance(
  job: ScoreImportJob,
  incoming: Pick<IncomingScoreRecord, 'claimedSource'>,
): Provenance {
  return {
    source: job.source,
    claimedSource: job.fetchedBy === 'client' ? (incoming.claimedSource ?? null) : null,
    fetchedBy: job.fetchedBy,
    verification: verificationForFetchedBy(job.fetchedBy),
    entryMethod: importEntryMethod(job),
    sourceAccountId: job.sourceAccountId ?? null,
    importJobId: job.id,
    rawPayloadSha256: job.rawPayloadSha256 ?? null,
    fetchedAt: job.fetchedAt ?? null,
    editedFromJobId: null,
  }
}

/**
 * `entry_method` of imported records: `migration` for first-sign-in migration (trigger `migration` or source
 * `legacy-local`), `import` for server fetches, `file` for other client uploads.
 */
export function importEntryMethod(job: Pick<ScoreImportJob, 'source' | 'fetchedBy' | 'trigger'>): EntryMethod {
  if (job.trigger === 'migration' || job.source === 'legacy-local') return 'migration'
  return job.fetchedBy === 'server' ? 'import' : 'file'
}

/** The stored record a manual mutation is checked against (only the fields the rules read are required) */
export type ManualBaseRecord = Pick<ExistingScoreRecord, 'deletedAt'> & {
  provenance: Pick<Provenance, 'source' | 'verification' | 'importJobId' | 'editedFromJobId'>
}

export interface ManualVerification {
  verification: Extract<Verification, 'client_reported' | 'user_edited'>
  editedFromJobId: string | null
}

/**
 * Verification of a manual `set` (§5.4): `client_reported` over nothing, a tombstone, or a manual record that was
 * not `user_edited`; otherwise (overriding an import, or editing a `user_edited` record) `user_edited`, remembering
 * the overridden import job.
 */
export function manualVerification(existing: ManualBaseRecord | null): ManualVerification {
  if (
    existing === null ||
    existing.deletedAt !== null ||
    (existing.provenance.source === 'manual' && existing.provenance.verification !== 'user_edited')
  ) {
    return { verification: 'client_reported', editedFromJobId: null }
  }

  return {
    verification: 'user_edited',
    editedFromJobId: existing.provenance.importJobId ?? existing.provenance.editedFromJobId ?? null,
  }
}

/** The value of a manual `set` (`SetValue`, §5.1); it never carries provenance */
export interface ManualSetValue {
  achievement: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
  dxScore?: number | null
}

export type ManualMutation =
  | { op: 'set'; basedOnRevision?: number | null; value: ManualSetValue; entryMethod: ManualEntryMethod }
  | { op: 'delete'; basedOnRevision?: number | null }

export const MANUAL_MUTATION_STATUSES = ['applied', 'superseded', 'noop', 'rejected'] as const
export type ManualMutationStatus = (typeof MANUAL_MUTATION_STATUSES)[number]

export type ManualMutationRejection =
  | 'invalid-achievement'
  | 'invalid-combo-flag'
  | 'invalid-sync-flag'
  | 'invalid-dx-score'
  | 'invalid-entry-method'
  | 'invalid-based-on-revision'

export interface ManualMutationDecision {
  status: ManualMutationStatus
  /** Set for `rejected` */
  reason: ManualMutationRejection | null
  /** The record after the mutation; `null` unless `applied` */
  next: NextScoreRecord | null
  bumpRevision: boolean
  valueChanged: boolean
  /** Change in the save's live record count */
  liveDelta: -1 | 0 | 1
  /** `superseded` decisions record a `superseded` event */
  eventKind: Extract<ScoreRecordEventKind, 'manual_set' | 'delete' | 'restore' | 'superseded'> | null
}

/**
 * Applies the rebase rules of a manual mutation (§5.4).
 *
 * - A missing `basedOnRevision` is baseline 0.
 * - Over nothing, a tombstone (restore) or a record not changed since the baseline: `applied`.
 * - Over a record changed after the baseline that is not `verified`: `applied` (latest intent wins).
 * - Over a `verified` record changed after the baseline: a `set` applies only when strictly better; a `delete` is
 *   always `superseded`.
 * - `set` of the value a live record already has (same achievement and flags, and the same or no `dxScore`), and
 *   `delete` of nothing or of a tombstone: `noop`, so a no-op never strips `verified`.
 * - Invalid values: `rejected`. Sheet ID validation is the caller's.
 */
export function decideManualMutation(
  existing: ExistingScoreRecord | null,
  mutation: ManualMutation,
): ManualMutationDecision {
  const rejection = validateMutation(mutation)
  if (rejection) return manualOutcome('rejected', null, rejection)

  const baseline = mutation.basedOnRevision ?? 0
  const live = existing !== null && existing.deletedAt === null

  if (mutation.op === 'delete') {
    if (!live) return manualOutcome('noop', null)
    if (existing.revision > baseline && existing.provenance.verification === 'verified') {
      return manualOutcome('superseded', null)
    }
    return {
      ...manualOutcome('applied', { ...fieldsOf(existing), deleted: true }),
      bumpRevision: true,
      liveDelta: -1,
      eventKind: 'delete',
    }
  }

  const value = mutation.value
  if (live) {
    const sameValue =
      compareScore(value, existing) === 0 && (value.dxScore == null || value.dxScore === existing.dxScore)
    if (sameValue) return manualOutcome('noop', null)

    if (
      existing.revision > baseline &&
      existing.provenance.verification === 'verified' &&
      !isStrictlyBetterScore(value, existing)
    ) {
      return manualOutcome('superseded', null)
    }
  }

  const { verification, editedFromJobId } = manualVerification(existing)
  const next: NextScoreRecord = {
    achievement: value.achievement,
    comboFlag: value.comboFlag ?? null,
    syncFlag: value.syncFlag ?? null,
    dxScore: value.dxScore ?? null,
    best50Bucket: null,
    providerRecordId: null,
    provenance: {
      source: 'manual',
      claimedSource: null,
      fetchedBy: 'client',
      verification,
      entryMethod: mutation.entryMethod,
      sourceAccountId: null,
      importJobId: null,
      rawPayloadSha256: null,
      fetchedAt: null,
      editedFromJobId,
    },
    deleted: false,
  }

  return {
    ...manualOutcome('applied', next),
    bumpRevision: true,
    valueChanged: true,
    liveDelta: live ? 0 : 1,
    eventKind: existing !== null && !live ? 'restore' : 'manual_set',
  }
}

function manualOutcome(
  status: ManualMutationStatus,
  next: NextScoreRecord | null,
  reason: ManualMutationRejection | null = null,
): ManualMutationDecision {
  return {
    status,
    reason,
    next,
    bumpRevision: false,
    valueChanged: false,
    liveDelta: 0,
    eventKind: status === 'superseded' ? 'superseded' : null,
  }
}

function validateMutation(mutation: ManualMutation): ManualMutationRejection | null {
  const baseline = mutation.basedOnRevision
  if (baseline != null && (!Number.isSafeInteger(baseline) || baseline < 0)) return 'invalid-based-on-revision'
  if (mutation.op === 'delete') return null

  const { value } = mutation
  if (!isAchievementInt(value.achievement)) return 'invalid-achievement'
  if (value.comboFlag != null && !Object.hasOwn(COMBO_RANK, value.comboFlag)) return 'invalid-combo-flag'
  if (value.syncFlag != null && !Object.hasOwn(SYNC_RANK, value.syncFlag)) return 'invalid-sync-flag'
  if (value.dxScore != null && (!Number.isSafeInteger(value.dxScore) || value.dxScore < 0)) return 'invalid-dx-score'
  if (!(MANUAL_ENTRY_METHODS as readonly string[]).includes(mutation.entryMethod)) return 'invalid-entry-method'
  return null
}

function applied(outcome: 'inserted' | 'revived' | 'improved', next: NextScoreRecord): ImportMergeDecision {
  return {
    outcome,
    countKey: countKeyOf(outcome),
    next,
    bumpRevision: true,
    valueChanged: true,
    liveDelta: outcome === 'improved' ? 0 : 1,
    eventKind: 'import_applied',
  }
}

function kept(outcome: 'skippedDeleted'): ImportMergeDecision {
  return {
    outcome,
    countKey: outcome,
    next: null,
    bumpRevision: false,
    valueChanged: false,
    liveDelta: 0,
    eventKind: null,
  }
}

function countKeyOf(outcome: ImportMergeOutcome): ImportCountKey {
  return outcome === 'revived' ? 'inserted' : outcome
}

function verificationForFetchedBy(fetchedBy: FetchedBy): Verification {
  return fetchedBy === 'server' ? 'verified' : 'client_reported'
}

function assertJob(job: ScoreImportJob): void {
  if (fetchedByForSource(job.source) !== job.fetchedBy) {
    throw new Error(`Import job ${job.id}: source ${job.source} cannot be fetched by ${job.fetchedBy}`)
  }
  if (isServerImportSource(job.source) && (!job.rawPayloadSha256 || !job.fetchedAt)) {
    throw new Error(`Import job ${job.id}: server jobs need rawPayloadSha256 and fetchedAt`)
  }
  toEpoch(job.startedAt)
}

function fieldsOf(record: ExistingScoreRecord): NextScoreRecord {
  return {
    achievement: record.achievement,
    comboFlag: record.comboFlag ?? null,
    syncFlag: record.syncFlag ?? null,
    dxScore: record.dxScore ?? null,
    best50Bucket: record.best50Bucket ?? null,
    providerRecordId: record.providerRecordId ?? null,
    provenance: { ...record.provenance },
    deleted: record.deletedAt !== null,
  }
}

function sameFields(a: NextScoreRecord, b: NextScoreRecord): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

function toEpoch(timestamp: string): number {
  const epoch = Date.parse(timestamp)
  if (Number.isNaN(epoch)) throw new RangeError(`Invalid timestamp: ${timestamp}`)
  return epoch
}

function sign(value: number): -1 | 0 | 1 {
  return value > 0 ? 1 : value < 0 ? -1 : 0
}