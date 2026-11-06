import {
  ACHIEVEMENT_INT_MAX,
  ACHIEVEMENT_INT_MIN,
  ClientImportSourceSchema,
  ImportSourceSchema,
  ImportTriggerSchema,
  ManualEntryMethodSchema,
  ProvenanceShapeSchema,
  PUBLIC_SHEET_ID_PATTERN,
  SourceAccountKindSchema,
  EntryMethodSchema,
  FetchedBySchema,
  type Best50Bucket,
  type ComboFlag,
  type SyncFlag,
} from '@gekichumai/maimai-domain'
import { oc as contractBuilder } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { z } from 'zod'

/**
 * Cloud save contract (gekichumai/meta#17, design §5.1).
 *
 * Every route is session-only and tagged `internal`, so it never reaches the public OpenAPI document, and
 * `cloud-save`. None of them is part of `publicContractRoutes`.
 *
 * The server never trusts a client's provenance claims: every input object is strict, so `fetchedBy`,
 * `verification`, `source` on a record or any other unknown key is a 400 validation error. `client-imports`
 * accepts only client sources; a provider a file claims goes into `claimedSource`. `demo` is not a source at all,
 * nor a claimed one.
 *
 * Batch inputs (mutations, client-import and replace records) are strict about keys but loose about each item's
 * values: one malformed item must not fail the batch (§5.4), or a queued outbox entry would block every later one
 * (§5.7). The handler validates each item with {@link MutationSchema} / {@link ImportRecordSchema} and answers a
 * failing mutation `rejected` with a reason, or counts a failing record as `rejected` in the job counts.
 *
 * Errors use the standard oRPC codes (their HTTP statuses need no custom status map) and carry a `reason` where one
 * code covers several cases:
 * - `NOT_FOUND` (404): the save or job does not exist, belongs to someone else, or cloud save is off for the user.
 * - `CONFLICT` (409) `{ reason: 'SAVE_LIMIT', limit }`: the user already has the maximum number of saves.
 * - `CONFLICT` (409) `{ reason: 'IMPORT_IN_PROGRESS', jobId }`: a job of the same source is running on the save.
 * - `PRECONDITION_FAILED` (412) `{ revision }`: `replace` with a stale `ifRevision`.
 * - `TOO_MANY_REQUESTS` (429) `{ retryAfterSeconds }`: rate limited (§11.4); the response also sets `Retry-After`.
 *
 * The maimai NET import streams progress over SSE. This repo serves its SSE routes from Hono rather than oRPC event
 * iterators (see `/functions/fetch-net-records/v1/:region`), so that route is a direct Hono route described by
 * {@link CLOUD_SAVE_NET_IMPORT_ROUTE} and its schemas below, not a procedure of {@link cloudSaveContract}.
 */

/** Every cloud-save route carries these tags; `internal` keeps it out of `/spec.json` */
export const CLOUD_SAVE_ROUTE_TAGS = ['internal', 'cloud-save']

/** Maximum saves per user (§5.1) */
export const CLOUD_SAVE_MAX_SAVES = 10
/** Maximum mutations per request (§5.1, §11.4) */
export const CLOUD_SAVE_MAX_MUTATIONS = 500
/** Maximum records per `client-imports` chunk (§5.1, §7.3, §11.4) */
export const CLOUD_SAVE_MAX_IMPORT_RECORDS = 5000
/**
 * Maximum records per `replace` request. A save holds at most one record per sheet, and the catalog has more than
 * 5000 sheets (7405 in 2026-11), so a replace must carry a whole save in one request: it cannot be chunked, as every
 * call checks and bumps `ifRevision`. Needs the 2 MB body limit of `client-imports` (§11.4).
 */
export const CLOUD_SAVE_MAX_REPLACE_RECORDS = 10000
/** Maximum chunks of one client import (5000 × 10 covers every chart of the catalog) */
export const CLOUD_SAVE_MAX_IMPORT_CHUNKS = 10
/** Maximum records per `changes` page */
export const CLOUD_SAVE_MAX_CHANGES_LIMIT = 1000
/** Maximum nesting depth of a snapshot's opaque `detail` (the object itself is depth 1) */
export const CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_DEPTH = 16
/** Maximum length of a snapshot's `detail` serialized as JSON */
export const CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_LENGTH = 32 * 1024

// --- Identifiers and values ---

export const SaveIdSchema = z.string().regex(/^dsav_[\w-]{1,64}$/)
export const ImportJobIdSchema = z.string().regex(/^dimp_[\w-]{1,64}$/)
/** Public sheet ID (`dsht_…`), the same pattern `score_records.sheet_id` CHECKs */
export const CloudSaveSheetIdSchema = z.string().regex(PUBLIC_SHEET_ID_PATTERN)

/**
 * Client-generated key of one user action (§5.5), reused on retry. Free-form within `[A-Za-z0-9._:-]`, e.g. a
 * UUID, `auto-net-<saveId>-<bucket>` or `migrate-<deviceId>-<profileKey>`.
 */
export const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9][\w.:-]{7,127}$/)
/** A mutation's ID, a UUIDv7 generated when the mutation enters the outbox (§5.5) */
export const MutationIdSchema = z.uuid({ version: 'v7' })

/** Integer achievement in 1/10000 % (`100.5432%` → `1005432`, §4.7) */
export const AchievementIntSchema = z.number().int().min(ACHIEVEMENT_INT_MIN).max(ACHIEVEMENT_INT_MAX)
export const ComboFlagSchema = z.enum(['fc', 'fcp', 'ap', 'app']).nullable() satisfies z.ZodType<ComboFlag>
export const SyncFlagSchema = z.enum(['fs', 'fsp', 'fsd', 'fsdp', 'sync']).nullable() satisfies z.ZodType<SyncFlag>
export const Best50BucketSchema = z.enum(['b15', 'b35']) satisfies z.ZodType<Best50Bucket>
export const DxScoreSchema = z.number().int().min(0).max(100000)
/**
 * PostgreSQL text and JSONB cannot hold U+0000, so a free-form string that reaches the database rejects it here: the
 * request (or the one import item) is a validation error, never a 500 that rolls back the rest of the write.
 */
const NO_NUL = /^[^\u0000]*$/
const NO_NUL_MESSAGE = 'must not contain U+0000'
export const ProviderRecordIdSchema = z.string().min(1).max(128).regex(NO_NUL, NO_NUL_MESSAGE)
/** A provider a client upload claims (e.g. `lxns` inside a DXRating JSON); stored as `claimed_source` only */
export const ClaimedSourceSchema = z
  .string()
  .regex(/^[\w.-]{1,64}$/)
  .refine((source) => source.toLowerCase() !== 'demo', { message: 'demo data is never synced' })
export const SourceAccountIdSchema = z.string().trim().min(1).max(128).regex(NO_NUL, NO_NUL_MESSAGE)
export const PayloadSha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
export const CloudSaveRegionSchema = z.enum(['jp', 'intl', 'cn', '_generic'])
/** dxdata version slug (`festival-plus` … `circle-plus`) */
export const GameVersionSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(32)
export const SaveNameSchema = z.string().trim().min(1).max(64).regex(NO_NUL, NO_NUL_MESSAGE)
export const ClientProfileKeySchema = z.string().regex(/^[\w.-]{1,64}$/)
export const RevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const TimestampSchema = z.iso.datetime({ offset: true })
const CountSchema = z.number().int().nonnegative()

const SaveIdParamSchema = { id: SaveIdSchema }
/** Server import triggers; `migration` is for client jobs only */
export const ServerImportTriggerSchema = z.enum(['user', 'auto'])

// --- Output DTOs ---

export const RecordDTOSchema = z.object({
  sheetId: z.string(),
  achievement: AchievementIntSchema,
  comboFlag: ComboFlagSchema,
  syncFlag: SyncFlagSchema,
  dxScore: DxScoreSchema.nullable(),
  best50Bucket: Best50BucketSchema.nullable(),
  providerRecordId: z.string().nullable(),
  provenance: ProvenanceShapeSchema,
  revision: RevisionSchema,
  /** Server clock */
  valueChangedAt: TimestampSchema,
  /** Device-reported, display only */
  clientEditedAt: TimestampSchema.nullable(),
  /** Set on tombstones, which keep the value they had when deleted */
  deletedAt: TimestampSchema.nullable(),
})
export type RecordDTO = z.output<typeof RecordDTOSchema>

export const SnapshotDTOSchema = z.object({
  id: z.number().int().positive(),
  atRevision: RevisionSchema,
  b15Sum: CountSchema,
  b35Sum: CountSchema,
  b50Sum: CountSchema,
  recordCount: CountSchema,
  gameVersion: z.string(),
  /** Opaque, computed by the client */
  detail: z.record(z.string(), z.json()).nullable(),
  createdAt: TimestampSchema,
})
export type SnapshotDTO = z.output<typeof SnapshotDTOSchema>

export const SaveDTOSchema = z.object({
  id: SaveIdSchema,
  name: z.string(),
  region: CloudSaveRegionSchema,
  /** `null` follows the client's selected version */
  gameVersion: z.string().nullable(),
  clientProfileKey: z.string().nullable(),
  revision: RevisionSchema,
  /** Live (non-tombstone) records */
  recordCount: CountSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  latestSnapshot: SnapshotDTOSchema.nullable(),
})
export type SaveDTO = z.output<typeof SaveDTOSchema>

/** `score_import_jobs.counts`; a running job may not have every key yet */
export const ImportCountsDTOSchema = z.object({
  fetched: CountSchema.default(0),
  inserted: CountSchema.default(0),
  improved: CountSchema.default(0),
  provenanceUpgraded: CountSchema.default(0),
  unchanged: CountSchema.default(0),
  keptUserEdit: CountSchema.default(0),
  skippedDeleted: CountSchema.default(0),
  skippedUnknownSheet: CountSchema.default(0),
  rejected: CountSchema.default(0),
})
export type ImportCountsDTO = z.output<typeof ImportCountsDTOSchema>

export const ImportJobStatusSchema = z.enum(['running', 'succeeded', 'failed'])

export const ImportJobDTOSchema = z.object({
  id: ImportJobIdSchema,
  saveId: SaveIdSchema,
  source: ImportSourceSchema,
  fetchedBy: FetchedBySchema,
  trigger: ImportTriggerSchema,
  /** Server-resolved for server jobs; client-claimed (`sourceAccountKind: 'claimed'`) for client jobs */
  sourceAccountId: z.string().nullable(),
  sourceAccountKind: SourceAccountKindSchema.nullable(),
  status: ImportJobStatusSchema,
  /** Server clock */
  startedAt: TimestampSchema,
  /** Server clock for server jobs; client-claimed for client jobs */
  fetchedAt: TimestampSchema.nullable(),
  finishedAt: TimestampSchema.nullable(),
  rawPayloadSha256: PayloadSha256Schema.nullable(),
  counts: ImportCountsDTOSchema,
  errorCode: z.string().nullable(),
})
export type ImportJobDTO = z.output<typeof ImportJobDTOSchema>

/** `{ job, revision }`, the result of every import */
export const ImportResultDTOSchema = z.object({
  job: ImportJobDTOSchema,
  /** The save's revision after the import */
  revision: RevisionSchema,
})
export type ImportResultDTO = z.output<typeof ImportResultDTOSchema>

/** Live-record checksum of a save (§5.8) */
export const ChecksumDTOSchema = z.object({
  count: CountSchema,
  sumAchievement: CountSchema,
})
export type ChecksumDTO = z.output<typeof ChecksumDTOSchema>

export const ChangesDTOSchema = z.object({
  /** Ordered by revision; tombstones included */
  records: z.array(RecordDTOSchema),
  /**
   * The cursor of the next pull: the highest revision of this page, or the save's revision on the last page (so a
   * finished pull, even of a save whose newest changes were purged tombstones, resumes past the tombstone horizon)
   */
  nextSince: RevisionSchema,
  hasMore: z.boolean(),
  /** The save's current revision */
  revision: RevisionSchema,
  /** `since` is older than the tombstone horizon: pull everything from `since=0` and rebase the outbox (§5.6) */
  resetRequired: z.boolean(),
  /** Set on the last page only (`hasMore: false`) */
  checksum: ChecksumDTOSchema.nullable(),
})
export type ChangesDTO = z.output<typeof ChangesDTOSchema>

export const MutationStatusSchema = z.enum(['applied', 'superseded', 'noop', 'rejected'])

export const MutationResultDTOSchema = z.object({
  mutationId: z.string(),
  status: MutationStatusSchema,
  /** The record after the mutation (`applied`), or the current record (`superseded`) */
  record: RecordDTOSchema.nullable(),
  /** Why the mutation was `rejected` */
  reason: z.string().nullable(),
})
export type MutationResultDTO = z.output<typeof MutationResultDTOSchema>

export const MutationsResultDTOSchema = z.object({
  revision: RevisionSchema,
  results: z.array(MutationResultDTOSchema),
})
export type MutationsResultDTO = z.output<typeof MutationsResultDTOSchema>

export const RecordEventKindSchema = z.enum([
  'import_applied',
  'provenance_upgraded',
  'manual_set',
  'delete',
  'restore',
  'superseded',
])

/** One entry of a record's provenance timeline (`score_record_events`, newest first) */
export const RecordEventDTOSchema = z.object({
  id: z.number().int().positive(),
  kind: RecordEventKindSchema,
  achievement: AchievementIntSchema.nullable(),
  comboFlag: ComboFlagSchema,
  syncFlag: SyncFlagSchema,
  dxScore: DxScoreSchema.nullable(),
  best50Bucket: Best50BucketSchema.nullable(),
  provenance: ProvenanceShapeSchema.omit({ editedFromJobId: true }).extend({
    entryMethod: EntryMethodSchema.nullable(),
  }),
  clientMutationId: z.string().nullable(),
  createdAt: TimestampSchema,
})
export type RecordEventDTO = z.output<typeof RecordEventDTOSchema>

// --- Inputs (all strict) ---

export const CreateSaveInputSchema = z.strictObject({
  name: SaveNameSchema,
  region: CloudSaveRegionSchema,
  gameVersion: GameVersionSchema.nullish(),
  /** iOS profile ID or Web `web-local`; creating a save with a key that already has one returns that save */
  clientProfileKey: ClientProfileKeySchema.nullish(),
})

export const UpdateSaveInputSchema = z
  .strictObject({
    ...SaveIdParamSchema,
    name: SaveNameSchema.optional(),
    /** `null` clears it (follow the client's version) */
    gameVersion: GameVersionSchema.nullish(),
  })
  .refine((input) => input.name !== undefined || input.gameVersion !== undefined, {
    message: 'Nothing to update',
  })

export const SaveIdInputSchema = z.strictObject(SaveIdParamSchema)

/**
 * `incremental` (default): changes after `since`, tombstones included; `resetRequired` when `since` is older than the
 * tombstone horizon (§5.6). `full`: a full pull (§5.6). `since = 0` is always a full pull (live records only); its
 * later pages pass `mode=full` with the previous `nextSince`, so they are never reset by the horizon (they include
 * the tombstones of records deleted while paging).
 */
export const ChangesModeSchema = z.enum(['incremental', 'full'])

export const ChangesInputSchema = z.strictObject({
  ...SaveIdParamSchema,
  since: z.coerce.number().pipe(RevisionSchema).default(0),
  mode: ChangesModeSchema.default('incremental'),
  limit: z.coerce.number().int().min(1).max(CLOUD_SAVE_MAX_CHANGES_LIMIT).default(CLOUD_SAVE_MAX_CHANGES_LIMIT),
})

/** The value of a manual `set`; it never carries provenance */
export const SetValueSchema = z.strictObject({
  achievement: AchievementIntSchema,
  comboFlag: ComboFlagSchema,
  syncFlag: SyncFlagSchema,
  dxScore: DxScoreSchema.nullish(),
})
export type SetValue = z.output<typeof SetValueSchema>

const mutationBase = {
  mutationId: MutationIdSchema,
  sheetId: CloudSaveSheetIdSchema,
  /** The revision the client saw; missing means 0 (§5.4) */
  basedOnRevision: RevisionSchema.nullish(),
  /** Device clock, display only */
  clientEditedAt: TimestampSchema.nullish(),
}

export const SetMutationSchema = z.strictObject({
  ...mutationBase,
  op: z.literal('set'),
  value: SetValueSchema,
  entryMethod: ManualEntryMethodSchema,
})

export const DeleteMutationSchema = z.strictObject({
  ...mutationBase,
  op: z.literal('delete'),
  /** Accepted for symmetry with `set`; deletes record no entry method */
  entryMethod: ManualEntryMethodSchema.optional(),
})

export const MutationSchema = z.discriminatedUnion('op', [SetMutationSchema, DeleteMutationSchema])
export type Mutation = z.output<typeof MutationSchema>

/**
 * One mutation as the route accepts it: the keys of {@link MutationSchema}, still strict, with values of any type
 * (only `mutationId` is checked, so the result can name the mutation). The
 * handler validates it with {@link MutationSchema}; a failure is that mutation's `rejected` result, not a 400 for the
 * batch (§5.4).
 */
export const MutationItemInputSchema = z.strictObject({
  mutationId: z.string().min(1).max(64),
  op: z.unknown().optional(),
  sheetId: z.unknown().optional(),
  basedOnRevision: z.unknown().optional(),
  clientEditedAt: z.unknown().optional(),
  // An object value keeps strict keys, so provenance claims inside it still fail the request; any other type is left to
  // the per-item check
  value: z
    .union([
      z.strictObject({
        achievement: z.unknown().optional(),
        comboFlag: z.unknown().optional(),
        syncFlag: z.unknown().optional(),
        dxScore: z.unknown().optional(),
      }),
      z.null(),
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.unknown()),
    ])
    .optional(),
  entryMethod: z.unknown().optional(),
})
export type MutationItemInput = z.output<typeof MutationItemInputSchema>

export const MutationsInputSchema = z.strictObject({
  ...SaveIdParamSchema,
  mutations: z.array(MutationItemInputSchema).min(1).max(CLOUD_SAVE_MAX_MUTATIONS),
})

/** One record of a client upload; no provenance fields other than the claimed provider */
export const ImportRecordSchema = z.strictObject({
  sheetId: CloudSaveSheetIdSchema,
  achievement: AchievementIntSchema,
  comboFlag: ComboFlagSchema,
  syncFlag: SyncFlagSchema,
  dxScore: DxScoreSchema.nullish(),
  best50Bucket: Best50BucketSchema.nullish(),
  providerRecordId: ProviderRecordIdSchema.nullish(),
  claimedSource: ClaimedSourceSchema.nullish(),
})
export type ImportRecord = z.output<typeof ImportRecordSchema>

/**
 * One uploaded record as `client-imports` and `replace` accept it: the keys of {@link ImportRecordSchema}, still
 * strict, with loose values. The handler validates each with {@link ImportRecordSchema} and counts a failure as
 * `rejected` instead of failing the upload.
 */
export const ImportRecordInputSchema = z.strictObject({
  sheetId: z.unknown().optional(),
  achievement: z.unknown().optional(),
  comboFlag: z.unknown().optional(),
  syncFlag: z.unknown().optional(),
  dxScore: z.unknown().optional(),
  best50Bucket: z.unknown().optional(),
  providerRecordId: z.unknown().optional(),
  claimedSource: z.unknown().optional(),
})
export type ImportRecordInput = z.output<typeof ImportRecordInputSchema>

/**
 * A client upload (§7.3). More than 5000 records go in chunks: every chunk repeats the `idempotencyKey` and the
 * job fields, `chunkIndex` counts from 0 and the job succeeds with the chunk `chunkCount - 1`.
 */
export const ClientImportInputSchema = z
  .strictObject({
    ...SaveIdParamSchema,
    idempotencyKey: IdempotencyKeySchema,
    source: ClientImportSourceSchema,
    trigger: ImportTriggerSchema,
    /** Client-claimed; stored with `sourceAccountKind: 'claimed'` */
    sourceAccountId: SourceAccountIdSchema.nullish(),
    /** Client-claimed */
    fetchedAt: TimestampSchema.nullish(),
    /** Compared with the hash the server computes, never stored as is */
    rawPayloadSha256: PayloadSha256Schema.nullish(),
    chunkIndex: z
      .number()
      .int()
      .min(0)
      .max(CLOUD_SAVE_MAX_IMPORT_CHUNKS - 1)
      .default(0),
    chunkCount: z.number().int().min(1).max(CLOUD_SAVE_MAX_IMPORT_CHUNKS).default(1),
    records: z.array(ImportRecordInputSchema).min(1).max(CLOUD_SAVE_MAX_IMPORT_RECORDS),
  })
  .refine((input) => input.chunkIndex < input.chunkCount, {
    message: 'chunkIndex must be less than chunkCount',
    path: ['chunkIndex'],
  })

export const LxnsImportInputSchema = z.strictObject({
  ...SaveIdParamSchema,
  idempotencyKey: IdempotencyKeySchema,
  trigger: ServerImportTriggerSchema,
})

export const DivingFishImportInputSchema = z
  .strictObject({
    ...SaveIdParamSchema,
    idempotencyKey: IdempotencyKeySchema,
    trigger: ServerImportTriggerSchema,
    username: z.string().trim().min(1).max(64).optional(),
    qq: z
      .string()
      .regex(/^\d{5,12}$/)
      .optional(),
  })
  .refine((input) => (input.username === undefined) !== (input.qq === undefined), {
    message: 'Provide exactly one of username and qq',
  })

export const ListImportJobsInputSchema = z.strictObject({
  ...SaveIdParamSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const ImportJobIdInputSchema = z.strictObject({ jobId: ImportJobIdSchema })

export const RecordEventsInputSchema = z.strictObject({
  ...SaveIdParamSchema,
  sheetId: CloudSaveSheetIdSchema,
})

/**
 * Whether `value` stays within the snapshot detail bounds. Walks iteratively (no recursion) and checks the depth and
 * the number of values before anything recursive (`z.json()`, `JSON.stringify`) touches it, so a deeply nested body
 * is a 400 rather than a stack overflow.
 */
function isBoundedSnapshotDetail(value: unknown): boolean {
  const pending: [unknown, number][] = [[value, 1]]
  let visited = 0
  while (pending.length > 0) {
    const [current, depth] = pending.pop()!
    // every value takes at least one character of the JSON
    if (++visited > CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_LENGTH) return false
    if (typeof current === 'string' && !NO_NUL.test(current)) return false
    if (typeof current !== 'object' || current === null) continue
    if (depth > CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_DEPTH) return false
    if (!Array.isArray(current) && Object.keys(current).some((key) => !NO_NUL.test(key))) return false
    for (const child of Array.isArray(current) ? current : Object.values(current)) pending.push([child, depth + 1])
  }
  return (JSON.stringify(value) ?? '').length <= CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_LENGTH
}

/** A snapshot's opaque `detail`: a JSON object of bounded depth and size, without U+0000 in its keys or strings */
export const SnapshotDetailSchema = z
  .custom<unknown>(isBoundedSnapshotDetail, {
    message: `detail must be JSON nested at most ${CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_DEPTH} deep and at most ${CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_LENGTH} characters long, without U+0000`,
  })
  .pipe(z.record(z.string(), z.json()))

export const CreateSnapshotInputSchema = z.strictObject({
  ...SaveIdParamSchema,
  atRevision: RevisionSchema,
  b15Sum: CountSchema,
  b35Sum: CountSchema,
  b50Sum: CountSchema,
  recordCount: CountSchema,
  gameVersion: GameVersionSchema,
  detail: SnapshotDetailSchema.optional(),
})

export const ListSnapshotsInputSchema = z.strictObject({
  ...SaveIdParamSchema,
  limit: z.coerce.number().int().min(1).max(100).default(100),
})

/**
 * Replaces every record of a save with `records`, all `client_reported` (§5.1). Clients call it only after the user
 * explicitly confirms; a stale `ifRevision` is a 412. Records failing {@link ImportRecordSchema} are dropped and counted
 * as `rejected`.
 */
export const ReplaceInputSchema = z.strictObject({
  ...SaveIdParamSchema,
  ifRevision: RevisionSchema,
  idempotencyKey: IdempotencyKeySchema,
  source: ClientImportSourceSchema,
  records: z.array(ImportRecordInputSchema).max(CLOUD_SAVE_MAX_REPLACE_RECORDS),
})

// --- Errors ---

const RateLimitedErrorDataSchema = z.object({ retryAfterSeconds: z.number().int().positive() })

export const CloudSaveErrorDataSchemas = {
  saveLimit: z.object({ reason: z.literal('SAVE_LIMIT'), limit: z.number().int().positive() }),
  importInProgress: z.object({ reason: z.literal('IMPORT_IN_PROGRESS'), jobId: ImportJobIdSchema }),
  preconditionFailed: z.object({ revision: RevisionSchema }),
  rateLimited: RateLimitedErrorDataSchema,
}

const oc = contractBuilder.errors({
  NOT_FOUND: { message: 'Not found' },
  TOO_MANY_REQUESTS: { message: 'Too many requests', data: RateLimitedErrorDataSchema },
})
const importErrors = { CONFLICT: { data: CloudSaveErrorDataSchemas.importInProgress } }

const route = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: `/${string}`, summary: string) =>
  openapi({ method, path, summary, tags: CLOUD_SAVE_ROUTE_TAGS })

// --- Routes ---

export const cloudSaveContract = {
  saves: {
    list: oc
      .meta(route('GET', '/saves', "List the user's cloud saves"))
      .output(z.object({ saves: z.array(SaveDTOSchema) })),
    create: oc
      .meta(route('POST', '/saves', 'Create a cloud save'))
      .errors({ CONFLICT: { data: CloudSaveErrorDataSchemas.saveLimit } })
      .input(CreateSaveInputSchema)
      .output(SaveDTOSchema),
    update: oc
      .meta(route('PATCH', '/saves/{id}', 'Rename a cloud save or change its game version'))
      .input(UpdateSaveInputSchema)
      .output(SaveDTOSchema),
    delete: oc
      .meta(route('DELETE', '/saves/{id}', 'Delete a cloud save'))
      .input(SaveIdInputSchema)
      .output(z.object({ success: z.boolean() })),
  },
  records: {
    changes: oc
      .meta(route('GET', '/saves/{id}/changes', 'Pull the records changed after a revision'))
      .input(ChangesInputSchema)
      .output(ChangesDTOSchema),
    mutate: oc
      .meta(route('POST', '/saves/{id}/mutations', 'Apply manual set and delete mutations'))
      .input(MutationsInputSchema)
      .output(MutationsResultDTOSchema),
    events: oc
      .meta(route('GET', '/saves/{id}/records/{sheetId}/events', "List a record's provenance timeline"))
      .input(RecordEventsInputSchema)
      .output(z.array(RecordEventDTOSchema)),
    replace: oc
      .meta(route('POST', '/saves/{id}/replace', 'Replace every record of a save'))
      .errors({ PRECONDITION_FAILED: { data: CloudSaveErrorDataSchemas.preconditionFailed } })
      .input(ReplaceInputSchema)
      .output(ImportResultDTOSchema),
  },
  imports: {
    client: oc
      .meta(route('POST', '/saves/{id}/client-imports', 'Upload records a client imported'))
      .errors(importErrors)
      .input(ClientImportInputSchema)
      .output(ImportResultDTOSchema),
    lxns: oc
      .meta(route('POST', '/saves/{id}/imports/lxns', 'Import from LXNS on the server'))
      .errors(importErrors)
      .input(LxnsImportInputSchema)
      .output(ImportResultDTOSchema),
    divingFish: oc
      .meta(route('POST', '/saves/{id}/imports/diving-fish', 'Import from Diving-Fish on the server'))
      .errors(importErrors)
      .input(DivingFishImportInputSchema)
      .output(ImportResultDTOSchema),
    get: oc
      .meta(route('GET', '/imports/{jobId}', 'Get an import job'))
      .input(ImportJobIdInputSchema)
      .output(ImportJobDTOSchema),
    list: oc
      .meta(route('GET', '/saves/{id}/imports', "List a save's recent import jobs"))
      .input(ListImportJobsInputSchema)
      .output(z.array(ImportJobDTOSchema)),
  },
  snapshots: {
    create: oc
      .meta(route('POST', '/saves/{id}/snapshots', 'Record a rating snapshot'))
      .input(CreateSnapshotInputSchema)
      .output(SnapshotDTOSchema),
    list: oc
      .meta(route('GET', '/saves/{id}/snapshots', "List a save's rating snapshots"))
      .input(ListSnapshotsInputSchema)
      .output(z.array(SnapshotDTOSchema)),
  },
  export: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/me/export',
        summary: "Download the user's cloud saves as a JSON file",
        tags: CLOUD_SAVE_ROUTE_TAGS,
        outputStructure: 'detailed',
      }),
    )
    .output(
      z.object({
        headers: z.record(z.string(), z.string()),
        body: z.instanceof(Blob),
      }),
    ),
}

// --- maimai NET import (direct Hono SSE route, not an oRPC procedure) ---

/**
 * `POST /api/v1/saves/{id}/imports/maimai-net` streams Server-Sent Events. Request body:
 * {@link NetImportInputSchema}; same session, feature, rate-limit and error rules as the oRPC routes (a running job
 * answers 409 with {@link CloudSaveErrorDataSchemas.importInProgress} before the stream starts). Events:
 * - `progress`: {@link NetImportProgressEventSchema}, repeated
 * - `done`: {@link ImportResultDTOSchema}, last
 * - `error`: {@link NetImportErrorEventSchema}, last
 *
 * The SEGA ID and password are used for this request only: never stored, never logged (§7.2).
 */
export const CLOUD_SAVE_NET_IMPORT_ROUTE = {
  method: 'POST',
  path: '/api/v1/saves/{id}/imports/maimai-net',
  honoPath: '/api/v1/saves/:id/imports/maimai-net',
  tags: CLOUD_SAVE_ROUTE_TAGS,
} as const

export const NetImportInputSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  trigger: ServerImportTriggerSchema,
  region: z.enum(['jp', 'intl']),
  id: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
})
export type NetImportInput = z.output<typeof NetImportInputSchema>

/** The path parameter of the NET import route */
export const NetImportParamsSchema = z.strictObject(SaveIdParamSchema)

export const NetImportProgressEventSchema = z.object({ state: z.string() })
export const NetImportErrorEventSchema = z.object({
  code: z.string(),
  message: z.string(),
  /** The failed job, when one was created */
  jobId: ImportJobIdSchema.nullable(),
})

export const NET_IMPORT_SSE_EVENTS = {
  progress: NetImportProgressEventSchema,
  done: ImportResultDTOSchema,
  error: NetImportErrorEventSchema,
} as const