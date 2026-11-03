import {
  ImportRecordSchema,
  type ImportCountsDTO,
  type ImportRecordInput,
  type ImportResultDTO,
} from '@gekichumai/api-contract'
import type { ClientImportSource, ImportTrigger } from '@gekichumai/maimai-domain'
import { Effect } from 'effect'
import type { Database } from '../../db/index'
import { CloudSaveBadRequest } from './errors'
import {
  canonicalSha256,
  countsOf,
  IMPORT_JOB_COLUMNS,
  startImportJob,
  toImportJobDTO,
  toMergeJob,
  type ImportJobRow,
} from './jobs'
import { applyImportRecords, shouldShortCircuit, type MergeRecord } from './merge'
import { lockSave, saveTransaction } from './saves'

type DatabaseService = typeof Database.Service

export interface ClientImportChunkInput {
  idempotencyKey: string
  source: ClientImportSource
  trigger: ImportTrigger
  sourceAccountId?: string | null
  fetchedAt?: string | null
  rawPayloadSha256?: string | null
  chunkIndex: number
  chunkCount: number
  records: readonly ImportRecordInput[]
}

/** Chunk progress, kept in the job's `counts` column next to the counts (never part of the job DTO) */
interface ChunkState {
  count: number
  /** sha256 of each received chunk's canonical records, by chunk index */
  received: Record<string, string>
}

const chunkStateOf = (counts: unknown): ChunkState | null => {
  const chunks = (counts as { chunks?: unknown } | null)?.chunks as ChunkState | undefined
  return chunks && typeof chunks.count === 'number' && typeof chunks.received === 'object' ? chunks : null
}

export interface ClientImportChunkResult {
  result: ImportResultDTO
  /** This chunk was already applied (or the job had ended): nothing was written */
  replayed: boolean
  /** The client sent a payload hash that differs from the one the server computed (logged, never stored) */
  hashMismatch: boolean
}

/**
 * Applies one chunk of a client upload (design §7.3), in its own transaction holding the save `FOR UPDATE`.
 *
 * - The job (`fetched_by='client'`, so every record is `client_reported`) is created by the first chunk that arrives
 *   with the idempotency key; later chunks repeat the key and find it. The key of another save or source is a 400.
 * - Each chunk is applied once: a chunk the job already received, or any chunk of a job that ended, is a replay that
 *   answers the job as it is (a client resuming after a lost answer). Merging is "keep the best", so even a
 *   repeated application would be harmless.
 * - The job succeeds when its last missing chunk is applied (normally chunk `chunkCount - 1`); counts add up over
 *   the chunks.
 * - `raw_payload_sha256` is computed by the server: each record carries the hash of the canonical JSON of the chunk
 *   records it came in; the job's is that hash for a single chunk, or the hash of the chunk hashes in order. The
 *   client's `rawPayloadSha256` is only compared with the chunk hash.
 * - The content short-circuit (§5.5) applies to single-chunk automatic and migration uploads.
 * - Records failing {@link ImportRecordSchema} (a bad sheet ID, an out-of-range value, a `demo` claim) count as
 *   `rejected`; the claimed provider of each record is stored as `claimed_source`.
 */
export const applyClientImportChunk = (
  database: DatabaseService,
  userId: string,
  saveId: string,
  input: ClientImportChunkInput,
) =>
  saveTransaction(database, () =>
    Effect.gen(function* () {
      const save = yield* lockSave(database, userId, saveId)
      const chunkSha = canonicalSha256(input.records)
      const hashMismatch = input.rawPayloadSha256 != null && input.rawPayloadSha256 !== chunkSha

      const started = yield* startImportJob(database, {
        userId,
        saveId: save.id,
        source: input.source,
        trigger: input.trigger,
        idempotencyKey: input.idempotencyKey,
        sourceAccountId: input.sourceAccountId ?? null,
        sourceAccountKind: input.sourceAccountId ? 'claimed' : null,
        fetchedAt: input.fetchedAt ? new Date(input.fetchedAt) : null,
        rawPayloadSha256: input.chunkCount === 1 ? chunkSha : null,
      })
      if (started.job.save_id !== save.id || started.job.source !== input.source) {
        return yield* new CloudSaveBadRequest({ message: 'The idempotency key belongs to another import' })
      }

      const { rows } = yield* database.raw<ImportJobRow>(
        'CloudSave.lockClientJob',
        `SELECT ${IMPORT_JOB_COLUMNS} FROM score_import_jobs WHERE id = $1 FOR UPDATE`,
        [started.job.id],
      )
      const job = rows[0]!
      const replay = (): ClientImportChunkResult => ({
        result: { job: toImportJobDTO(job), revision: save.revision },
        replayed: true,
        hashMismatch,
      })
      if (job.status !== 'running') return replay()

      const chunks: ChunkState = chunkStateOf(job.counts) ?? { count: input.chunkCount, received: {} }
      if (chunks.count !== input.chunkCount) {
        return yield* new CloudSaveBadRequest({ message: 'chunkCount differs from the earlier chunks of this import' })
      }
      if (chunks.received[String(input.chunkIndex)] !== undefined) return replay()

      const records: MergeRecord[] = []
      let rejected = 0
      for (const item of input.records) {
        const parsed = ImportRecordSchema.safeParse(item)
        if (parsed.success) records.push(parsed.data)
        else rejected += 1
      }

      let counts: ImportCountsDTO
      if (input.chunkCount === 1 && (yield* shouldShortCircuit(database, job, save.revision))) {
        counts = countsOf({ fetched: input.records.length, unchanged: records.length, rejected })
      } else {
        const merged = yield* applyImportRecords(
          database,
          save,
          { ...toMergeJob(job), rawPayloadSha256: chunkSha },
          records,
        )
        counts = { ...merged.counts, fetched: input.records.length, rejected: merged.counts.rejected + rejected }
      }
      const previous = countsOf(job.counts)
      for (const key of Object.keys(counts) as (keyof ImportCountsDTO)[]) counts[key] += previous[key]

      const received = { ...chunks.received, [String(input.chunkIndex)]: chunkSha }
      const complete = Object.keys(received).length === chunks.count
      const finalSha = complete
        ? chunks.count === 1
          ? chunkSha
          : canonicalSha256(Array.from({ length: chunks.count }, (_, index) => received[String(index)]))
        : null
      const { rows: updated } = yield* database.raw<ImportJobRow>(
        'CloudSave.updateClientJob',
        `UPDATE score_import_jobs SET counts = $2::jsonb,
           status = CASE WHEN $3 THEN 'succeeded' ELSE status END,
           finished_at = CASE WHEN $3 THEN now() ELSE finished_at END,
           raw_payload_sha256 = COALESCE($4, raw_payload_sha256)
         WHERE id = $1 RETURNING ${IMPORT_JOB_COLUMNS}`,
        [
          job.id,
          // A finished job records the save revision it left behind, for the content short-circuit (§5.5)
          JSON.stringify({
            ...counts,
            chunks: { count: chunks.count, received },
            ...(complete ? { saveRevision: save.revision } : {}),
          }),
          complete,
          finalSha,
        ],
      )
      return {
        result: { job: toImportJobDTO(updated[0]!), revision: save.revision },
        replayed: false,
        hashMismatch,
      } satisfies ClientImportChunkResult
    }),
  )