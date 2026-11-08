import { fromAchievementInt } from '@gekichumai/maimai-domain'
import { Data, Effect } from 'effect'
import type { Database } from '../../db/index'
import { IMPORT_JOB_COLUMNS, toImportJobDTO, type ImportJobRow } from './jobs'
import {
  parseRecordRow,
  RECORD_COLUMNS,
  RECORD_EVENT_COLUMNS,
  toRecordDTO,
  toRecordEventDTO,
  type RecordEventRow,
  type RecordRow,
  type RecordState,
} from './records'
import { SAVE_COLUMNS, SNAPSHOT_COLUMNS, toSaveDTO, toSnapshotDTO, type SaveRow, type SnapshotRow } from './saves'

type DatabaseService = typeof Database.Service

export const EXPORT_FORMAT = 'dxrating-cloud-save-export'
export const EXPORT_VERSION = 1
const PAGE_SIZE = 1000

/**
 * One exported record: a superset of an entry of the DXRating JSON export (Web "all records", iOS
 * `RatingJSONTransfer.Entry`: `sheetId`, `achievementRate` in percent, `comboFlag`, `syncFlag`, `dxScore`, and the
 * iOS `dxrating` metadata), plus the cloud fields (`achievement` as an integer, `best50Bucket`, `providerRecordId`,
 * `provenance`, `revision`, timestamps). Both clients' JSON importers keep unknown keys or ignore them, so a save's
 * `records` array imports as a rating file (as `client_reported`, like any file).
 */
export function toExportRecord(state: RecordState) {
  const providerRecordId =
    state.providerRecordId !== null && /^\d{1,15}$/.test(state.providerRecordId) ? Number(state.providerRecordId) : null
  return {
    ...toRecordDTO(state),
    achievementRate: fromAchievementInt(state.achievement),
    dxrating: {
      source: state.provenance.source,
      ...(providerRecordId === null ? {} : { providerRecordId }),
      ...(state.dxScore === null ? {} : { dxScore: state.dxScore }),
      ...(state.best50Bucket === null ? {} : { best50Bucket: state.best50Bucket }),
    },
  }
}

/** Exports that may run at once: each holds one pooled connection for its whole download */
export const EXPORT_CONCURRENCY = 2
/**
 * How long the export waits for the client to take the next chunk. Past it the export's transaction ends and its slot
 * is freed, whether or not the client ever reads again (a stalled download, a response nobody reads)
 */
export const EXPORT_IDLE_MS = 60_000
/** Postgres's own backstop for the same case, past {@link EXPORT_IDLE_MS} */
export const EXPORT_SESSION_IDLE_TIMEOUT = '120s'

let runningExports = 0

/**
 * Takes one of the {@link EXPORT_CONCURRENCY} export slots; `null` when all are taken. The release function frees it
 * once; call it when the download ends, however it ends.
 */
export function tryAcquireExportSlot(): (() => void) | null {
  if (runningExports >= EXPORT_CONCURRENCY) return null
  runningExports++
  let released = false
  return () => {
    if (released) return
    released = true
    runningExports--
  }
}

/** The client stopped reading: the export's transaction ends without reading further */
class ExportAbandoned extends Data.TaggedError('ExportAbandoned') {}

/**
 * A one-chunk handoff between the export's transaction (the producer) and the download (the consumer): the producer
 * waits until the consumer has taken each chunk, so the export reads only as fast as the client downloads.
 */
class ChunkChannel {
  private chunk: string | null = null
  private finished = false
  private failure: { error: unknown } | null = null
  private closed = false
  private wakeConsumer: (() => void) | null = null
  private wakeProducer: (() => void) | null = null

  constructor(private readonly idleMs: number) {}

  /**
   * Hands one chunk over; resolves once it was taken. Rejects once the consumer stopped, or when it has not taken the
   * chunk within `idleMs` (the channel then counts as closed)
   */
  async push(chunk: string): Promise<void> {
    if (this.closed) throw new Error('export abandoned')
    this.chunk = chunk
    this.wake('consumer')
    const deadline = Date.now() + this.idleMs
    while (this.chunk !== null && !this.closed) {
      const left = deadline - Date.now()
      if (left <= 0) {
        // The download fails rather than ending short: a later read throws instead of taking a chunk
        this.closed = true
        this.chunk = null
        this.failure = { error: new Error('The export stopped: the client did not read in time') }
        break
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left)
        this.wakeProducer = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    }
    if (this.closed) throw new Error('export abandoned')
  }

  /** The next chunk; `null` once the producer finished. Throws the producer's failure */
  async take(): Promise<string | null> {
    for (;;) {
      if (this.chunk !== null) {
        const chunk = this.chunk
        this.chunk = null
        this.wake('producer')
        return chunk
      }
      if (this.failure) throw this.failure.error
      if (this.finished) return null
      await new Promise<void>((resolve) => (this.wakeConsumer = resolve))
    }
  }

  finish() {
    this.finished = true
    this.wake('consumer')
  }

  fail(error: unknown) {
    this.failure = { error }
    this.wake('consumer')
  }

  /** The consumer stopped: a waiting or later push rejects */
  close() {
    this.closed = true
    this.wake('producer')
  }

  private wake(side: 'consumer' | 'producer') {
    const wake = side === 'consumer' ? this.wakeConsumer : this.wakeProducer
    if (side === 'consumer') this.wakeConsumer = null
    else this.wakeProducer = null
    wake?.()
  }
}

/**
 * Streams the export of every save of `userId` as JSON text chunks (design §11.3):
 *
 * ```
 * { format, version, exportedAt,
 *   saves: [{ ...SaveDTO, deletedAt, records: [live records], tombstones: [RecordDTO],
 *             importJobs: [ImportJobDTO], events: [{ sheetId, ...RecordEventDTO }], snapshots: [SnapshotDTO] }] }
 * ```
 *
 * Every save the user still has is included, a soft-deleted one too (with `deletedAt`) until the cleanup removes it.
 * The whole export is one consistent snapshot: it is read in a single read-only REPEATABLE READ transaction, so a
 * write that lands while the file downloads is either entirely in it or not at all (each save's `revision` matches
 * its records, events and jobs). Each table is still read in pages of 1000 rows, handed to the download one chunk at
 * a time; nothing holds the whole export in memory. The transaction holds one pooled connection until the download
 * ends: callers take a slot with {@link tryAcquireExportSlot}, and a client that stops reading for
 * {@link EXPORT_IDLE_MS} fails the download and frees the slot.
 */
export function exportChunks(
  run: <A, E>(effect: Effect.Effect<A, E, never>) => Promise<A>,
  database: DatabaseService,
  userId: string,
  exportedAt: Date,
  options: {
    /** Called once the export's transaction has ended, however it ended: free its slot here */
    onSettled?: () => void
    idleMs?: number
  } = {},
): AsyncGenerator<string> {
  const channel = new ChunkChannel(options.idleMs ?? EXPORT_IDLE_MS)
  const emit = (chunk: string) =>
    Effect.tryPromise({ try: () => channel.push(chunk), catch: () => new ExportAbandoned() })
  const produce = database.transaction(() =>
    Effect.gen(function* () {
      yield* database.raw('CloudSave.exportSnapshot', 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
      yield* database.raw(
        'CloudSave.exportIdleTimeout',
        `SET LOCAL idle_in_transaction_session_timeout = '${EXPORT_SESSION_IDLE_TIMEOUT}'`,
      )
      // The snapshot is taken at the transaction's first read, before anything is sent
      const { rows: saves } = yield* database.raw<SaveRow>(
        'CloudSave.exportSaves',
        `SELECT ${SAVE_COLUMNS} FROM score_saves s WHERE s.user_id = $1 ORDER BY s.created_at, s.id`,
        [userId],
      )
      yield* emit(
        `{"format":${JSON.stringify(EXPORT_FORMAT)},"version":${EXPORT_VERSION},"exportedAt":${JSON.stringify(exportedAt.toISOString())},"saves":[`,
      )
      for (const [index, save] of saves.entries()) {
        const { rows: snapshots } = yield* database.raw<SnapshotRow>(
          'CloudSave.exportSnapshots',
          `SELECT ${SNAPSHOT_COLUMNS} FROM score_save_snapshots WHERE save_id = $1 AND user_id = $2
             ORDER BY created_at, id`,
          [save.id, userId],
        )
        const dto = toSaveDTO(save, snapshots.at(-1) ?? null)
        const header = JSON.stringify({ ...dto, deletedAt: save.deleted_at?.toISOString() ?? null })
        yield* emit(`${index > 0 ? ',' : ''}${header.slice(0, -1)}`)

        const tombstones: RecordState[] = []
        yield* emit(',"records":[')
        let first = true
        let afterSheet = ''
        for (;;) {
          const { rows } = yield* database.raw<RecordRow>(
            'CloudSave.exportRecords',
            `SELECT ${RECORD_COLUMNS} FROM score_records WHERE save_id = $1 AND user_id = $2 AND sheet_id > $3
               ORDER BY sheet_id LIMIT ${PAGE_SIZE}`,
            [save.id, userId, afterSheet],
          )
          const parts: string[] = []
          for (const row of rows) {
            const state = parseRecordRow(row)
            if (state.deletedAt !== null) {
              tombstones.push(state)
              continue
            }
            parts.push(JSON.stringify(toExportRecord(state)))
          }
          if (parts.length > 0) {
            yield* emit(`${first ? '' : ','}${parts.join(',')}`)
            first = false
          }
          if (rows.length < PAGE_SIZE) break
          afterSheet = rows[rows.length - 1]!.sheet_id
        }
        yield* emit(`],"tombstones":[${tombstones.map((state) => JSON.stringify(toRecordDTO(state))).join(',')}]`)

        const { rows: jobs } = yield* database.raw<ImportJobRow>(
          'CloudSave.exportJobs',
          `SELECT ${IMPORT_JOB_COLUMNS} FROM score_import_jobs WHERE save_id = $1 AND user_id = $2
             ORDER BY started_at, id`,
          [save.id, userId],
        )
        yield* emit(`,"importJobs":[${jobs.map((job) => JSON.stringify(toImportJobDTO(job))).join(',')}],"events":[`)

        first = true
        let afterEvent = 0n
        for (;;) {
          const { rows } = yield* database.raw<RecordEventRow & { sheet_id: string }>(
            'CloudSave.exportEvents',
            `SELECT sheet_id, ${RECORD_EVENT_COLUMNS} FROM score_record_events
               WHERE save_id = $1 AND user_id = $2 AND id > $3 ORDER BY id LIMIT ${PAGE_SIZE}`,
            [save.id, userId, afterEvent.toString()],
          )
          if (rows.length > 0) {
            const parts = rows.map((row) => JSON.stringify({ sheetId: row.sheet_id, ...toRecordEventDTO(row) }))
            yield* emit(`${first ? '' : ','}${parts.join(',')}`)
            first = false
          }
          if (rows.length < PAGE_SIZE) break
          afterEvent = BigInt(rows[rows.length - 1]!.id)
        }
        yield* emit(
          `],"snapshots":[${snapshots.map((snapshot) => JSON.stringify(toSnapshotDTO(snapshot))).join(',')}]}`,
        )
      }
      yield* emit(']}\n')
    }),
  )
  // Started now, not on the first read: a response nobody reads still ends at the idle deadline and frees its slot
  const producer = run(produce)
    .then(
      () => channel.finish(),
      (error: unknown) => channel.fail(error),
    )
    .finally(() => options.onSettled?.())
  return (async function* () {
    try {
      for (;;) {
        const chunk = await channel.take()
        if (chunk === null) return
        yield chunk
      }
    } finally {
      // Stopped early (the client went away) or done: the transaction ends either way, and nothing is left running
      channel.close()
      await producer
    }
  })()
}

/** The download headers of an export */
export function exportHeaders(exportedAt: Date): Record<string, string> {
  const stamp = exportedAt.toISOString().replace(/[:.]/g, '-')
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="dxrating-cloud-export-${stamp}.json"`,
  }
}