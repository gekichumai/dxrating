import { fromAchievementInt } from '@gekichumai/maimai-domain'
import { Effect } from 'effect'
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

/**
 * The user's cloud data as a JSON document (§11.3), produced in chunks so it can be streamed:
 *
 * ```
 * { format, version, exportedAt,
 *   saves: [{ ...SaveDTO, deletedAt, records: [live records], tombstones: [RecordDTO],
 *             importJobs: [ImportJobDTO], events: [{ sheetId, ...RecordEventDTO }], snapshots: [SnapshotDTO] }] }
 * ```
 *
 * Every save the user still has is included, a soft-deleted one too (with `deletedAt`) until the cleanup removes it.
 * Each table is read in pages of 1000 rows; nothing holds the whole export in memory.
 */
export async function* exportChunks(
  run: <A, E>(effect: Effect.Effect<A, E, never>) => Promise<A>,
  database: DatabaseService,
  userId: string,
  exportedAt: Date,
): AsyncGenerator<string> {
  yield `{"format":${JSON.stringify(EXPORT_FORMAT)},"version":${EXPORT_VERSION},"exportedAt":${JSON.stringify(exportedAt.toISOString())},"saves":[`
  const { rows: saves } = await run(
    database.raw<SaveRow>(
      'CloudSave.exportSaves',
      `SELECT ${SAVE_COLUMNS} FROM score_saves s WHERE s.user_id = $1 ORDER BY s.created_at, s.id`,
      [userId],
    ),
  )
  for (const [index, save] of saves.entries()) {
    const { rows: snapshots } = await run(
      database.raw<SnapshotRow>(
        'CloudSave.exportSnapshots',
        `SELECT ${SNAPSHOT_COLUMNS} FROM score_save_snapshots WHERE save_id = $1 AND user_id = $2
         ORDER BY created_at, id`,
        [save.id, userId],
      ),
    )
    const dto = toSaveDTO(save, snapshots.at(-1) ?? null)
    const header = JSON.stringify({ ...dto, deletedAt: save.deleted_at?.toISOString() ?? null })
    yield `${index > 0 ? ',' : ''}${header.slice(0, -1)}`

    const tombstones: RecordState[] = []
    yield ',"records":['
    let first = true
    let afterSheet = ''
    for (;;) {
      const { rows } = await run(
        database.raw<RecordRow>(
          'CloudSave.exportRecords',
          `SELECT ${RECORD_COLUMNS} FROM score_records WHERE save_id = $1 AND user_id = $2 AND sheet_id > $3
           ORDER BY sheet_id LIMIT ${PAGE_SIZE}`,
          [save.id, userId, afterSheet],
        ),
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
        yield `${first ? '' : ','}${parts.join(',')}`
        first = false
      }
      if (rows.length < PAGE_SIZE) break
      afterSheet = rows[rows.length - 1]!.sheet_id
    }
    yield `],"tombstones":[${tombstones.map((state) => JSON.stringify(toRecordDTO(state))).join(',')}]`

    const { rows: jobs } = await run(
      database.raw<ImportJobRow>(
        'CloudSave.exportJobs',
        `SELECT ${IMPORT_JOB_COLUMNS} FROM score_import_jobs WHERE save_id = $1 AND user_id = $2
         ORDER BY started_at, id`,
        [save.id, userId],
      ),
    )
    yield `,"importJobs":[${jobs.map((job) => JSON.stringify(toImportJobDTO(job))).join(',')}],"events":[`

    first = true
    let afterEvent = 0n
    for (;;) {
      const { rows } = await run(
        database.raw<RecordEventRow & { sheet_id: string }>(
          'CloudSave.exportEvents',
          `SELECT sheet_id, ${RECORD_EVENT_COLUMNS} FROM score_record_events
           WHERE save_id = $1 AND user_id = $2 AND id > $3 ORDER BY id LIMIT ${PAGE_SIZE}`,
          [save.id, userId, afterEvent.toString()],
        ),
      )
      if (rows.length > 0) {
        const parts = rows.map((row) => JSON.stringify({ sheetId: row.sheet_id, ...toRecordEventDTO(row) }))
        yield `${first ? '' : ','}${parts.join(',')}`
        first = false
      }
      if (rows.length < PAGE_SIZE) break
      afterEvent = BigInt(rows[rows.length - 1]!.id)
    }
    yield `],"snapshots":[${snapshots.map((snapshot) => JSON.stringify(toSnapshotDTO(snapshot))).join(',')}]}`
  }
  yield ']}\n'
}

/** The download headers of an export */
export function exportHeaders(exportedAt: Date): Record<string, string> {
  const stamp = exportedAt.toISOString().replace(/[:.]/g, '-')
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="dxrating-cloud-export-${stamp}.json"`,
  }
}