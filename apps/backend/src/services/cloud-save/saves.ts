import { randomBytes } from 'node:crypto'
import { CLOUD_SAVE_MAX_SAVES, type SaveDTO, type SnapshotDTO } from '@gekichumai/api-contract'
import { Effect } from 'effect'
import type { Database } from '../../db/index'
import {
  CloudSaveBadRequest,
  CloudSaveBusy,
  CloudSaveLimitReached,
  CloudSaveNotFound,
  isLockNotAvailable,
} from './errors'
import type { LockedSave } from './records'

type DatabaseService = typeof Database.Service

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** A 21-character nanoid (126 random bits) */
export function nanoid(size = 21): string {
  const bytes = randomBytes(size)
  let id = ''
  for (const byte of bytes) id += ID_ALPHABET[byte & 63]
  return id
}

export const newSaveId = () => `dsav_${nanoid()}`
export const newImportJobId = () => `dimp_${nanoid()}`

/** At most one snapshot per save per this window (§5.1, #184); later posts update the window's snapshot */
export const SNAPSHOT_WINDOW_MS = 10 * 60_000
/** Snapshots kept per save */
export const MAX_SNAPSHOTS_PER_SAVE = 100

/**
 * How long a writer waits for a lock (the save row, the per-user save-creation lock) before giving up with
 * `CloudSaveBusy` (429): a waiting writer holds one of the few pool connections (§7.1), so the wait is bounded.
 */
export const SAVE_LOCK_TIMEOUT_MS = 5000

/** Bounds the lock waits of the rest of the current transaction to {@link SAVE_LOCK_TIMEOUT_MS} */
const setLockTimeout = (database: DatabaseService) =>
  database.raw('CloudSave.lockTimeout', `SET LOCAL lock_timeout = '${SAVE_LOCK_TIMEOUT_MS}ms'`)

/** Turns a lock wait that ran out (`lock_not_available`) into `CloudSaveBusy` */
const busyOnLockTimeout = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((error) => (isLockNotAvailable(error) ? new CloudSaveBusy() : error)))

/**
 * Locks the user's live save `FOR UPDATE` (§5.2). Every save write path runs inside a transaction that starts with
 * this; another user's save, a deleted one and a missing one are the same `CloudSaveNotFound`. The wait for the lock
 * (and every later lock wait of the transaction) is bounded by {@link SAVE_LOCK_TIMEOUT_MS}: `CloudSaveBusy` after.
 */
export const lockSave = (database: DatabaseService, userId: string, saveId: string) =>
  Effect.gen(function* () {
    yield* setLockTimeout(database)
    const { rows } = yield* busyOnLockTimeout(
      database.raw<{
        id: string
        user_id: string
        revision: bigint
        record_count: number
        now: Date
      }>(
        'CloudSave.lockSave',
        `SELECT id, user_id, revision, record_count, now() AS now FROM score_saves
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [saveId, userId],
      ),
    )
    const row = rows[0]
    if (!row) return yield* new CloudSaveNotFound()
    return {
      id: row.id,
      userId: row.user_id,
      revision: Number(row.revision),
      recordCount: row.record_count,
      now: row.now,
    } satisfies LockedSave
  })

/** Fails with `CloudSaveNotFound` unless the user has this live save; no lock */
export const findSave = (database: DatabaseService, userId: string, saveId: string) =>
  Effect.gen(function* () {
    const { rows } = yield* database.raw<SaveRow>(
      'CloudSave.findSave',
      `SELECT ${SAVE_COLUMNS} FROM score_saves s WHERE s.id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL`,
      [saveId, userId],
    )
    const row = rows[0]
    if (!row) return yield* new CloudSaveNotFound()
    return row
  })

export interface SaveRow {
  id: string
  name: string
  region: string
  game_version: string | null
  client_profile_key: string | null
  revision: bigint
  tombstone_horizon: bigint
  record_count: number
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export const SAVE_COLUMNS = `s.id, s.name, s.region, s.game_version, s.client_profile_key, s.revision, s.tombstone_horizon,
  s.record_count, s.created_at, s.updated_at, s.deleted_at`

export interface SnapshotRow {
  id: bigint
  at_revision: bigint
  b15_sum: number
  b35_sum: number
  b50_sum: number
  record_count: number
  game_version: string
  detail: Record<string, unknown> | null
  created_at: Date
}

export const SNAPSHOT_COLUMNS = `id, at_revision, b15_sum, b35_sum, b50_sum, record_count, game_version, detail, created_at`

export function toSnapshotDTO(row: SnapshotRow): SnapshotDTO {
  return {
    id: Number(row.id),
    atRevision: Number(row.at_revision),
    b15Sum: row.b15_sum,
    b35Sum: row.b35_sum,
    b50Sum: row.b50_sum,
    recordCount: row.record_count,
    gameVersion: row.game_version,
    detail: row.detail as SnapshotDTO['detail'],
    createdAt: row.created_at.toISOString(),
  }
}

export function toSaveDTO(row: SaveRow, latestSnapshot: SnapshotRow | null): SaveDTO {
  return {
    id: row.id,
    name: row.name,
    region: row.region as SaveDTO['region'],
    gameVersion: row.game_version,
    clientProfileKey: row.client_profile_key,
    revision: Number(row.revision),
    recordCount: row.record_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    latestSnapshot: latestSnapshot ? toSnapshotDTO(latestSnapshot) : null,
  }
}

const latestSnapshots = (database: DatabaseService, saveIds: string[]) =>
  Effect.gen(function* () {
    if (saveIds.length === 0) return new Map<string, SnapshotRow>()
    const { rows } = yield* database.raw<SnapshotRow & { save_id: string }>(
      'CloudSave.latestSnapshots',
      `SELECT DISTINCT ON (save_id) save_id, ${SNAPSHOT_COLUMNS} FROM score_save_snapshots
       WHERE save_id = ANY($1::text[]) ORDER BY save_id, created_at DESC, id DESC`,
      [saveIds],
    )
    return new Map(rows.map((row) => [row.save_id, row]))
  })

/** The user's live saves, oldest first, each with its latest snapshot */
export const listSaves = (database: DatabaseService, userId: string) =>
  Effect.gen(function* () {
    const { rows } = yield* database.raw<SaveRow>(
      'CloudSave.listSaves',
      `SELECT ${SAVE_COLUMNS} FROM score_saves s WHERE s.user_id = $1 AND s.deleted_at IS NULL
       ORDER BY s.created_at, s.id`,
      [userId],
    )
    const snapshots = yield* latestSnapshots(
      database,
      rows.map((row) => row.id),
    )
    return rows.map((row) => toSaveDTO(row, snapshots.get(row.id) ?? null))
  })

const saveDTO = (database: DatabaseService, row: SaveRow) =>
  Effect.map(latestSnapshots(database, [row.id]), (snapshots) => toSaveDTO(row, snapshots.get(row.id) ?? null))

export interface CreateSaveInput {
  name: string
  region: string
  gameVersion?: string | null
  clientProfileKey?: string | null
}

/**
 * Creates a save (§5.1). A live save with the same `clientProfileKey` is returned as it is (idempotent); past
 * {@link CLOUD_SAVE_MAX_SAVES} live saves fails with `CloudSaveLimitReached`. A transaction-scoped advisory lock per
 * user serializes concurrent creations, so neither check races.
 */
export const createSave = (database: DatabaseService, userId: string, input: CreateSaveInput) =>
  database.transaction(() =>
    Effect.gen(function* () {
      yield* setLockTimeout(database)
      yield* busyOnLockTimeout(
        database.raw('CloudSave.lockUserSaves', `SELECT pg_advisory_xact_lock(hashtext('cloudsave:saves:' || $1))`, [
          userId,
        ]),
      )
      const clientProfileKey = input.clientProfileKey ?? null
      if (clientProfileKey !== null) {
        const { rows } = yield* database.raw<SaveRow>(
          'CloudSave.findSaveByProfile',
          `SELECT ${SAVE_COLUMNS} FROM score_saves s
           WHERE s.user_id = $1 AND s.client_profile_key = $2 AND s.deleted_at IS NULL`,
          [userId, clientProfileKey],
        )
        if (rows[0]) return yield* saveDTO(database, rows[0])
      }
      const { rows: counted } = yield* database.raw<{ count: number }>(
        'CloudSave.countSaves',
        `SELECT count(*)::integer AS count FROM score_saves WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId],
      )
      if ((counted[0]?.count ?? 0) >= CLOUD_SAVE_MAX_SAVES) {
        return yield* new CloudSaveLimitReached({ limit: CLOUD_SAVE_MAX_SAVES })
      }
      const { rows } = yield* database.raw<SaveRow>(
        'CloudSave.createSave',
        `INSERT INTO score_saves AS s (id, user_id, name, region, game_version, client_profile_key)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${SAVE_COLUMNS}`,
        [newSaveId(), userId, input.name, input.region, input.gameVersion ?? null, clientProfileKey],
      )
      return toSaveDTO(rows[0]!, null)
    }),
  )

/** Renames a save or changes its game version (`null` clears it; `undefined` keeps it) */
export const updateSave = (
  database: DatabaseService,
  userId: string,
  saveId: string,
  input: { name?: string; gameVersion?: string | null },
) =>
  Effect.gen(function* () {
    const { rows } = yield* database.raw<SaveRow>(
      'CloudSave.updateSave',
      `UPDATE score_saves AS s SET
         name = COALESCE($3, s.name),
         game_version = CASE WHEN $4::boolean THEN $5 ELSE s.game_version END,
         updated_at = now()
       WHERE s.id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL
       RETURNING ${SAVE_COLUMNS}`,
      [saveId, userId, input.name ?? null, input.gameVersion !== undefined, input.gameVersion ?? null],
    )
    const row = rows[0]
    if (!row) return yield* new CloudSaveNotFound()
    return yield* saveDTO(database, row)
  })

/**
 * Soft-deletes a save: it disappears from every route at once, frees its `clientProfileKey`, and the daily cleanup
 * hard-deletes it (and everything in it) after 30 days.
 */
export const deleteSave = (database: DatabaseService, userId: string, saveId: string) =>
  Effect.gen(function* () {
    const { rows } = yield* database.raw<{ id: string }>(
      'CloudSave.deleteSave',
      `UPDATE score_saves SET deleted_at = now(), updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
      [saveId, userId],
    )
    if (!rows[0]) return yield* new CloudSaveNotFound()
    return { success: true }
  })

export interface CreateSnapshotInput {
  atRevision: number
  b15Sum: number
  b35Sum: number
  b50Sum: number
  recordCount: number
  gameVersion: string
  detail?: Record<string, unknown>
}

/**
 * Records a rating snapshot (#184). At most one snapshot per save starts in any {@link SNAPSHOT_WINDOW_MS}: a post
 * within 10 minutes of the newest snapshot's creation overwrites that snapshot (keeping its id and creation time),
 * so frequent syncs keep the latest numbers without growing the history. Past {@link MAX_SNAPSHOTS_PER_SAVE} the
 * oldest are dropped. `atRevision` cannot be ahead of the save.
 */
export const createSnapshot = (database: DatabaseService, userId: string, saveId: string, input: CreateSnapshotInput) =>
  database.transaction(() =>
    Effect.gen(function* () {
      const save = yield* lockSave(database, userId, saveId)
      if (input.atRevision > save.revision) {
        return yield* new CloudSaveBadRequest({ message: 'atRevision is ahead of the save' })
      }
      const values = [
        input.atRevision,
        input.b15Sum,
        input.b35Sum,
        input.b50Sum,
        input.recordCount,
        input.gameVersion,
        input.detail === undefined ? null : JSON.stringify(input.detail),
      ]
      const { rows: updated } = yield* database.raw<SnapshotRow>(
        'CloudSave.updateRecentSnapshot',
        `UPDATE score_save_snapshots SET at_revision = $3, b15_sum = $4, b35_sum = $5, b50_sum = $6,
           record_count = $7, game_version = $8, detail = $9::jsonb
         WHERE id = (
           SELECT id FROM score_save_snapshots WHERE save_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1
         ) AND created_at > $2
         RETURNING ${SNAPSHOT_COLUMNS}`,
        [save.id, new Date(save.now.getTime() - SNAPSHOT_WINDOW_MS), ...values],
      )
      if (updated[0]) return toSnapshotDTO(updated[0])
      const { rows } = yield* database.raw<SnapshotRow>(
        'CloudSave.createSnapshot',
        `INSERT INTO score_save_snapshots
           (save_id, user_id, at_revision, b15_sum, b35_sum, b50_sum, record_count, game_version, detail, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         RETURNING ${SNAPSHOT_COLUMNS}`,
        [save.id, save.userId, ...values, save.now],
      )
      yield* trimSnapshots(database, save.id)
      return toSnapshotDTO(rows[0]!)
    }),
  )

/** Deletes the snapshots of one save (or of every save) beyond the newest {@link MAX_SNAPSHOTS_PER_SAVE} */
export const trimSnapshots = (database: DatabaseService, saveId: string | null) =>
  Effect.map(
    database.raw<{ id: bigint }>(
      'CloudSave.trimSnapshots',
      `DELETE FROM score_save_snapshots WHERE id IN (
         SELECT id FROM (
           SELECT id, row_number() OVER (PARTITION BY save_id ORDER BY created_at DESC, id DESC) AS position
           FROM score_save_snapshots WHERE $1::text IS NULL OR save_id = $1
         ) ranked WHERE position > ${MAX_SNAPSHOTS_PER_SAVE}
       ) RETURNING id`,
      [saveId],
    ),
    ({ rows }) => rows.length,
  )

export const listSnapshots = (database: DatabaseService, userId: string, saveId: string, limit: number) =>
  Effect.gen(function* () {
    yield* findSave(database, userId, saveId)
    const { rows } = yield* database.raw<SnapshotRow>(
      'CloudSave.listSnapshots',
      `SELECT ${SNAPSHOT_COLUMNS} FROM score_save_snapshots WHERE save_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [saveId, Math.min(limit, MAX_SNAPSHOTS_PER_SAVE)],
    )
    return rows.map(toSnapshotDTO)
  })