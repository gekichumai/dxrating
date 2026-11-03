import { createHash } from 'node:crypto'
import type { ImportCountsDTO, ImportJobDTO } from '@gekichumai/api-contract'
import {
  fetchedByForSource,
  type ImportSource,
  type ImportTrigger,
  type ScoreImportJob,
  type SourceAccountKind,
} from '@gekichumai/maimai-domain'
import { Effect } from 'effect'
import type { Database } from '../../db/index'
import { CloudSaveNotFound, ImportInProgress } from './errors'
import { newImportJobId } from './saves'

type DatabaseService = typeof Database.Service

export interface ImportJobRow {
  id: string
  save_id: string
  source: string
  fetched_by: string
  trigger: string
  source_account_id: string | null
  source_account_kind: string | null
  idempotency_key: string
  status: string
  started_at: Date
  fetched_at: Date | null
  finished_at: Date | null
  raw_payload_sha256: string | null
  counts: Partial<ImportCountsDTO>
  error_code: string | null
}

const IMPORT_JOB_COLUMN_NAMES = [
  'id',
  'save_id',
  'source',
  'fetched_by',
  'trigger',
  'source_account_id',
  'source_account_kind',
  'idempotency_key',
  'status',
  'started_at',
  'fetched_at',
  'finished_at',
  'raw_payload_sha256',
  'counts',
  'error_code',
]
export const IMPORT_JOB_COLUMNS = IMPORT_JOB_COLUMN_NAMES.join(', ')
const importJobColumnsOf = (alias: string) => IMPORT_JOB_COLUMN_NAMES.map((name) => `${alias}.${name}`).join(', ')

export const EMPTY_COUNTS: ImportCountsDTO = {
  fetched: 0,
  inserted: 0,
  improved: 0,
  provenanceUpgraded: 0,
  unchanged: 0,
  keptUserEdit: 0,
  skippedDeleted: 0,
  skippedUnknownSheet: 0,
  rejected: 0,
}

export function toImportJobDTO(row: ImportJobRow): ImportJobDTO {
  return {
    id: row.id,
    saveId: row.save_id,
    source: row.source as ImportJobDTO['source'],
    fetchedBy: row.fetched_by as ImportJobDTO['fetchedBy'],
    trigger: row.trigger as ImportJobDTO['trigger'],
    sourceAccountId: row.source_account_id,
    sourceAccountKind: row.source_account_kind as ImportJobDTO['sourceAccountKind'],
    status: row.status as ImportJobDTO['status'],
    startedAt: row.started_at.toISOString(),
    fetchedAt: row.fetched_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    rawPayloadSha256: row.raw_payload_sha256,
    counts: countsOf(row.counts),
    errorCode: row.error_code,
  }
}

/** The public counts of a job row; other keys of the `counts` column (`saveRevision`) stay internal */
function countsOf(stored: Partial<ImportCountsDTO> | null): ImportCountsDTO {
  const counts = { ...EMPTY_COUNTS }
  for (const key of Object.keys(EMPTY_COUNTS) as (keyof ImportCountsDTO)[]) {
    const value = stored?.[key]
    if (typeof value === 'number') counts[key] = value
  }
  return counts
}

/** The job as `decideImportMerge` reads it */
export function toMergeJob(row: ImportJobRow): ScoreImportJob {
  return {
    id: row.id,
    source: row.source as ImportSource,
    fetchedBy: row.fetched_by as ScoreImportJob['fetchedBy'],
    trigger: row.trigger as ImportTrigger,
    startedAt: row.started_at.toISOString(),
    fetchedAt: row.fetched_at?.toISOString() ?? null,
    rawPayloadSha256: row.raw_payload_sha256,
    sourceAccountId: row.source_account_id,
  }
}

/** Deepest nesting {@link canonicalJson} accepts; hashed values are validated records, a few levels deep */
export const CANONICAL_MAX_DEPTH = 32

/**
 * sha256 hex of the canonical JSON (object keys sorted) of `value` (§4.2 `raw_payload_sha256`). Only hash validated,
 * normalized values: anything nested deeper than {@link CANONICAL_MAX_DEPTH} levels throws instead of recursing.
 */
export function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, 0))
}

function canonicalize(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= CANONICAL_MAX_DEPTH) {
    throw new RangeError(`canonicalJson: value nested deeper than ${CANONICAL_MAX_DEPTH} levels`)
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, depth + 1))
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key], depth + 1)]),
  )
}

export interface StartImportJobInput {
  userId: string
  saveId: string
  source: ImportSource
  trigger: ImportTrigger
  idempotencyKey: string
  sourceAccountId?: string | null
  sourceAccountKind?: SourceAccountKind | null
  /** Server clock for server jobs (set later by the fetch), client-claimed for client jobs */
  fetchedAt?: Date | null
  rawPayloadSha256?: string | null
}

/**
 * Creates a `running` job (§5.5, §7.1), unless the user already has a job with this idempotency key, which is
 * returned instead (`replayed`, whatever its save or status). A running job of the same source on the save fails
 * with `ImportInProgress` (409 with its ID): the partial unique index `score_import_jobs_one_running` guarantees at
 * most one, and `ON CONFLICT DO NOTHING` keeps a conflict from aborting the caller's transaction.
 *
 * The caller must already know the save is the user's; jobs only ever reference their own save.
 */
export const startImportJob = (database: DatabaseService, input: StartImportJobInput) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { rows } = yield* database.raw<ImportJobRow>(
        'CloudSave.startImportJob',
        `INSERT INTO score_import_jobs (id, user_id, save_id, source, fetched_by, source_account_id,
           source_account_kind, trigger, idempotency_key, status, fetched_at, raw_payload_sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'running', $10, $11)
         ON CONFLICT DO NOTHING
         RETURNING ${IMPORT_JOB_COLUMNS}`,
        [
          newImportJobId(),
          input.userId,
          input.saveId,
          input.source,
          fetchedByForSource(input.source),
          input.sourceAccountId ?? null,
          input.sourceAccountKind ?? null,
          input.trigger,
          input.idempotencyKey,
          input.fetchedAt ?? null,
          input.rawPayloadSha256 ?? null,
        ],
      )
      if (rows[0]) return { job: rows[0], replayed: false }

      const { rows: existing } = yield* database.raw<ImportJobRow>(
        'CloudSave.findJobByKey',
        `SELECT ${IMPORT_JOB_COLUMNS} FROM score_import_jobs WHERE user_id = $1 AND idempotency_key = $2`,
        [input.userId, input.idempotencyKey],
      )
      if (existing[0]) return { job: existing[0], replayed: true }

      const running = yield* findRunningJob(database, input.saveId, input.source)
      if (running) return yield* new ImportInProgress({ jobId: running })
      // The conflicting job finished in between: try again
    }
    return yield* Effect.die(new Error('Could not start an import job after 3 attempts'))
  })

/** The ID of the running job of `source` on the save, if any */
export const findRunningJob = (database: DatabaseService, saveId: string, source: ImportSource) =>
  Effect.map(
    database.raw<{ id: string }>(
      'CloudSave.findRunningJob',
      `SELECT id FROM score_import_jobs WHERE save_id = $1 AND source = $2 AND status = 'running'`,
      [saveId, source],
    ),
    ({ rows }) => rows[0]?.id ?? null,
  )

/**
 * Ends a job; only a running job changes. `saveRevision` (the save's revision once the job is applied, in the same
 * transaction) is kept in the `counts` column, internal: the content short-circuit (§5.5) only trusts a previous
 * job's payload hash while the save is still at that revision.
 */
export const finishImportJob = (
  database: DatabaseService,
  jobId: string,
  outcome: {
    status: 'succeeded' | 'failed'
    counts: Partial<ImportCountsDTO>
    errorCode?: string | null
    saveRevision?: number | null
  },
) =>
  Effect.map(
    database.raw<ImportJobRow>(
      'CloudSave.finishImportJob',
      `UPDATE score_import_jobs SET status = $2, counts = $3::jsonb, error_code = $4, finished_at = now()
       WHERE id = $1 AND status = 'running' RETURNING ${IMPORT_JOB_COLUMNS}`,
      [
        jobId,
        outcome.status,
        JSON.stringify(
          outcome.saveRevision == null ? outcome.counts : { ...outcome.counts, saveRevision: outcome.saveRevision },
        ),
        outcome.errorCode ?? null,
      ],
    ),
    ({ rows }) => rows[0] ?? null,
  )

/** A job of the user's live saves; anything else is `CloudSaveNotFound` */
export const getImportJob = (database: DatabaseService, userId: string, jobId: string) =>
  Effect.gen(function* () {
    const { rows } = yield* database.raw<ImportJobRow>(
      'CloudSave.getImportJob',
      `SELECT ${importJobColumnsOf('j')} FROM score_import_jobs j
       JOIN score_saves s ON s.id = j.save_id AND s.user_id = j.user_id AND s.deleted_at IS NULL
       WHERE j.id = $1 AND j.user_id = $2`,
      [jobId, userId],
    )
    if (!rows[0]) return yield* new CloudSaveNotFound()
    return toImportJobDTO(rows[0])
  })

/** The save's latest jobs, newest first (the caller checks the save is the user's) */
export const listImportJobs = (database: DatabaseService, userId: string, saveId: string, limit: number) =>
  Effect.map(
    database.raw<ImportJobRow>(
      'CloudSave.listImportJobs',
      `SELECT ${IMPORT_JOB_COLUMNS} FROM score_import_jobs WHERE save_id = $1 AND user_id = $2
       ORDER BY started_at DESC, id DESC LIMIT $3`,
      [saveId, userId, limit],
    ),
    ({ rows }) => rows.map(toImportJobDTO),
  )