import type { ChangesDTO, RecordEventDTO } from '@gekichumai/api-contract'
import { Effect } from 'effect'
import type { Database } from '../../db/index'
import {
  parseRecordRow,
  RECORD_COLUMNS,
  RECORD_EVENT_COLUMNS,
  toRecordDTO,
  toRecordEventDTO,
  type RecordEventRow,
  type RecordRow,
} from './records'
import { findSave } from './saves'

type DatabaseService = typeof Database.Service

/** Events per record the timeline returns (and the cleanup keeps) */
export const RECORD_EVENTS_KEPT = 20

/**
 * Pulls the records of a save changed after `since` (§5.2, §5.6, §5.8), read in one REPEATABLE READ snapshot.
 *
 * - `since = 0` is a full pull: live records only, no tombstones (a client rebuilding its cache needs none).
 * - `since > 0` is incremental: live records and tombstones with `revision > since`, ordered by revision.
 * - `resetRequired`: `since > 0` and either older than the save's tombstone horizon (a purged tombstone may be
 *   missing) or ahead of the save's revision (the client's cursor does not belong to this save). The page is then
 *   empty (`nextSince = 0`, `hasMore = false`, no checksum) and the client pulls again from `since = 0` (live rows),
 *   rebuilds its cache from it and rebases its outbox.
 * - `nextSince` is the highest revision of the page (`since` when empty); `hasMore` says another page follows.
 * - `checksum` (`count`, `sumAchievement` of live records) comes with the last page only, from the same snapshot.
 */
export const pullChanges = (database: DatabaseService, userId: string, saveId: string, since: number, limit: number) =>
  database.transaction(() =>
    Effect.gen(function* () {
      yield* database.raw('CloudSave.repeatableRead', 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
      const save = yield* findSave(database, userId, saveId)
      const revision = Number(save.revision)
      const horizon = Number(save.tombstone_horizon)
      if (since > 0 && (since < horizon || since > revision)) {
        return {
          records: [],
          nextSince: 0,
          hasMore: false,
          revision,
          resetRequired: true,
          checksum: null,
        } satisfies ChangesDTO
      }

      const { rows } = yield* database.raw<RecordRow>(
        'CloudSave.pullChanges',
        `SELECT ${RECORD_COLUMNS} FROM score_records
         WHERE save_id = $1 AND revision > $2 AND ($2 > 0 OR deleted_at IS NULL)
         ORDER BY revision LIMIT $3`,
        [saveId, since, limit + 1],
      )
      const hasMore = rows.length > limit
      const records = rows.slice(0, limit).map((row) => toRecordDTO(parseRecordRow(row)))
      let checksum: ChangesDTO['checksum'] = null
      if (!hasMore) {
        const { rows: sums } = yield* database.raw<{ count: number; sum: bigint | null }>(
          'CloudSave.checksum',
          `SELECT count(*)::integer AS count, sum(achievement)::int8 AS sum FROM score_records
           WHERE save_id = $1 AND deleted_at IS NULL`,
          [saveId],
        )
        checksum = { count: sums[0]?.count ?? 0, sumAchievement: Number(sums[0]?.sum ?? 0) }
      }
      return {
        records,
        nextSince: records.length > 0 ? records[records.length - 1]!.revision : since,
        hasMore,
        revision,
        resetRequired: false,
        checksum,
      } satisfies ChangesDTO
    }),
  )

/** A record's provenance timeline, newest first, at most {@link RECORD_EVENTS_KEPT} */
export const listRecordEvents = (database: DatabaseService, userId: string, saveId: string, sheetId: string) =>
  Effect.gen(function* () {
    yield* findSave(database, userId, saveId)
    const { rows } = yield* database.raw<RecordEventRow>(
      'CloudSave.listRecordEvents',
      `SELECT ${RECORD_EVENT_COLUMNS} FROM score_record_events WHERE save_id = $1 AND sheet_id = $2
       ORDER BY id DESC LIMIT ${RECORD_EVENTS_KEPT}`,
      [saveId, sheetId],
    )
    return rows.map(toRecordEventDTO) satisfies RecordEventDTO[]
  })