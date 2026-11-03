import type { RecordDTO, RecordEventDTO } from '@gekichumai/api-contract'
import type {
  Best50Bucket,
  ComboFlag,
  EntryMethod,
  ExistingScoreRecord,
  FetchedBy,
  NextScoreRecord,
  Provenance,
  ScoreRecordEventKind,
  ScoreSource,
  SyncFlag,
  Verification,
} from '@gekichumai/maimai-domain'
import { Effect } from 'effect'
import type { Database } from '../../db/index'

type DatabaseService = typeof Database.Service

/** Rows per write statement (design §5.3, §7.1) */
export const WRITE_BATCH_SIZE = 1000

/** A `score_records` row as the write paths hold it */
export interface RecordState {
  sheetId: string
  achievement: number
  comboFlag: ComboFlag
  syncFlag: SyncFlag
  dxScore: number | null
  best50Bucket: Best50Bucket | null
  providerRecordId: string | null
  provenance: Provenance
  revision: number
  valueChangedAt: Date
  clientMutationId: string | null
  clientEditedAt: Date | null
  deletedAt: Date | null
}

/** Columns of `score_records` in the shape {@link parseRecordRow} reads */
export const RECORD_COLUMNS = `
  sheet_id, achievement, combo_flag, sync_flag, dx_score, best50_bucket, provider_record_id,
  source, claimed_source, fetched_by, verification, entry_method, source_account_id, import_job_id,
  raw_payload_sha256, fetched_at, edited_from_job_id, revision, client_mutation_id, value_changed_at,
  client_edited_at, deleted_at`

export interface RecordRow {
  sheet_id: string
  achievement: number
  combo_flag: string | null
  sync_flag: string | null
  dx_score: number | null
  best50_bucket: string | null
  provider_record_id: string | null
  source: string
  claimed_source: string | null
  fetched_by: string
  verification: string
  entry_method: string
  source_account_id: string | null
  import_job_id: string | null
  raw_payload_sha256: string | null
  fetched_at: Date | null
  edited_from_job_id: string | null
  revision: bigint | number | string
  client_mutation_id: string | null
  value_changed_at: Date
  client_edited_at: Date | null
  deleted_at: Date | null
}

const iso = (value: Date | null) => (value === null ? null : value.toISOString())

export function parseRecordRow(row: RecordRow): RecordState {
  return {
    sheetId: row.sheet_id,
    achievement: row.achievement,
    comboFlag: row.combo_flag as ComboFlag,
    syncFlag: row.sync_flag as SyncFlag,
    dxScore: row.dx_score,
    best50Bucket: row.best50_bucket as Best50Bucket | null,
    providerRecordId: row.provider_record_id,
    provenance: {
      source: row.source as ScoreSource,
      claimedSource: row.claimed_source,
      fetchedBy: row.fetched_by as FetchedBy,
      verification: row.verification as Verification,
      entryMethod: row.entry_method as EntryMethod,
      sourceAccountId: row.source_account_id,
      importJobId: row.import_job_id,
      rawPayloadSha256: row.raw_payload_sha256,
      fetchedAt: iso(row.fetched_at),
      editedFromJobId: row.edited_from_job_id,
    },
    revision: Number(row.revision),
    valueChangedAt: row.value_changed_at,
    clientMutationId: row.client_mutation_id,
    clientEditedAt: row.client_edited_at,
    deletedAt: row.deleted_at,
  }
}

/** The stored record as the maimai-domain decisions read it */
export function toExistingRecord(state: RecordState): ExistingScoreRecord {
  return {
    achievement: state.achievement,
    comboFlag: state.comboFlag,
    syncFlag: state.syncFlag,
    dxScore: state.dxScore,
    best50Bucket: state.best50Bucket,
    providerRecordId: state.providerRecordId,
    provenance: { ...state.provenance },
    revision: state.revision,
    deletedAt: iso(state.deletedAt),
  }
}

export function toRecordDTO(state: RecordState): RecordDTO {
  return {
    sheetId: state.sheetId,
    achievement: state.achievement,
    comboFlag: state.comboFlag,
    syncFlag: state.syncFlag,
    dxScore: state.dxScore,
    best50Bucket: state.best50Bucket,
    providerRecordId: state.providerRecordId,
    provenance: { ...state.provenance },
    revision: state.revision,
    valueChangedAt: state.valueChangedAt.toISOString(),
    clientEditedAt: iso(state.clientEditedAt),
    deletedAt: iso(state.deletedAt),
  }
}

/** A `score_record_events` row before insertion */
export interface RecordEvent {
  sheetId: string
  kind: ScoreRecordEventKind
  achievement: number | null
  comboFlag: ComboFlag
  syncFlag: SyncFlag
  dxScore: number | null
  best50Bucket: Best50Bucket | null
  source: ScoreSource
  claimedSource: string | null
  fetchedBy: FetchedBy
  verification: Verification
  entryMethod: EntryMethod | null
  sourceAccountId: string | null
  importJobId: string | null
  rawPayloadSha256: string | null
  fetchedAt: string | null
  clientMutationId: string | null
}

/** The event that records `state` as it is now */
export function eventOf(state: RecordState, kind: ScoreRecordEventKind): RecordEvent {
  return {
    sheetId: state.sheetId,
    kind,
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
    clientMutationId: state.clientMutationId,
  }
}

export interface RecordEventRow {
  id: bigint | number | string
  kind: string
  achievement: number | null
  combo_flag: string | null
  sync_flag: string | null
  dx_score: number | null
  best50_bucket: string | null
  source: string
  claimed_source: string | null
  fetched_by: string
  verification: string
  entry_method: string | null
  source_account_id: string | null
  import_job_id: string | null
  raw_payload_sha256: string | null
  fetched_at: Date | null
  client_mutation_id: string | null
  created_at: Date
}

export const RECORD_EVENT_COLUMNS = `
  id, kind, achievement, combo_flag, sync_flag, dx_score, best50_bucket, source, claimed_source, fetched_by,
  verification, entry_method, source_account_id, import_job_id, raw_payload_sha256, fetched_at,
  client_mutation_id, created_at`

export function toRecordEventDTO(row: RecordEventRow): RecordEventDTO {
  return {
    id: Number(row.id),
    kind: row.kind as RecordEventDTO['kind'],
    achievement: row.achievement,
    comboFlag: row.combo_flag as ComboFlag,
    syncFlag: row.sync_flag as SyncFlag,
    dxScore: row.dx_score,
    best50Bucket: row.best50_bucket as Best50Bucket | null,
    provenance: {
      source: row.source as ScoreSource,
      claimedSource: row.claimed_source,
      fetchedBy: row.fetched_by as FetchedBy,
      verification: row.verification as Verification,
      entryMethod: row.entry_method as EntryMethod | null,
      sourceAccountId: row.source_account_id,
      importJobId: row.import_job_id,
      rawPayloadSha256: row.raw_payload_sha256,
      fetchedAt: iso(row.fetched_at),
    },
    clientMutationId: row.client_mutation_id,
    createdAt: row.created_at.toISOString(),
  }
}

/** The `score_saves` row a writer holds `FOR UPDATE` */
export interface LockedSave {
  id: string
  userId: string
  revision: number
  recordCount: number
  /** Transaction time (server clock); every row the transaction writes uses it */
  now: Date
}

export interface RecordChange {
  /** The record before the change, `null` when there was none */
  before: RecordState | null
  next: NextScoreRecord
  bumpRevision: boolean
  valueChanged: boolean
  liveDelta: number
  eventKind: ScoreRecordEventKind | null
  /**
   * Set for manual mutations. Omitted: kept when neither the value nor the origin (source, verification) changes,
   * cleared otherwise.
   */
  clientMutationId?: string | null
  clientEditedAt?: Date | null
}

/**
 * Writes the records of one save inside a transaction that holds its `score_saves` row `FOR UPDATE` (§5.2).
 *
 * Every revision-bumping change takes the next revision (`save.revision + k` for the k-th one); `finish` adds the
 * count to the save's revision. A record changed twice keeps the later revision. Changes are buffered per record and
 * written by {@link RecordWriter.flush} in statements of at most {@link WRITE_BATCH_SIZE} rows, with one event row per
 * effective change.
 */
export class RecordWriter {
  readonly startRevision: number
  revision: number
  liveDelta = 0
  private readonly states = new Map<string, RecordState | null>()
  private readonly dirty = new Set<string>()
  private events: RecordEvent[] = []

  constructor(
    private readonly database: DatabaseService,
    readonly save: LockedSave,
  ) {
    this.startRevision = save.revision
    this.revision = save.revision
  }

  /** Loads the stored records of `sheetIds` that are not loaded yet */
  load(sheetIds: Iterable<string>) {
    const missing = [...new Set(sheetIds)].filter((sheetId) => !this.states.has(sheetId))
    return Effect.gen({ self: this }, function* () {
      for (let offset = 0; offset < missing.length; offset += WRITE_BATCH_SIZE) {
        const chunk = missing.slice(offset, offset + WRITE_BATCH_SIZE)
        const { rows } = yield* this.database.raw<RecordRow>(
          'CloudSave.loadRecords',
          `SELECT ${RECORD_COLUMNS} FROM score_records WHERE save_id = $1 AND sheet_id = ANY($2::text[])`,
          [this.save.id, chunk],
        )
        for (const sheetId of chunk) this.states.set(sheetId, null)
        for (const row of rows) this.states.set(row.sheet_id, parseRecordRow(row))
      }
    })
  }

  /** Loads every stored record of the save, tombstones included */
  loadAll() {
    return Effect.gen({ self: this }, function* () {
      let after = ''
      for (;;) {
        const { rows } = yield* this.database.raw<RecordRow>(
          'CloudSave.loadAllRecords',
          `SELECT ${RECORD_COLUMNS} FROM score_records WHERE save_id = $1 AND sheet_id > $2
           ORDER BY sheet_id LIMIT ${WRITE_BATCH_SIZE}`,
          [this.save.id, after],
        )
        for (const row of rows) if (!this.states.has(row.sheet_id)) this.states.set(row.sheet_id, parseRecordRow(row))
        if (rows.length < WRITE_BATCH_SIZE) return
        after = rows[rows.length - 1]!.sheet_id
      }
    })
  }

  /** The current state of a loaded record (`null`: none) */
  get(sheetId: string): RecordState | null {
    const state = this.states.get(sheetId)
    if (state === undefined) throw new Error(`Record ${sheetId} was not loaded`)
    return state
  }

  /** The current state of a record, `null` when it is not stored (or not loaded) */
  find(sheetId: string): RecordState | null {
    return this.states.get(sheetId) ?? null
  }

  /** Every loaded record that exists */
  loaded(): RecordState[] {
    return [...this.states.values()].filter((state): state is RecordState => state !== null)
  }

  /** Applies a decision to a loaded record and returns its new state */
  apply(sheetId: string, change: RecordChange): RecordState {
    const before = change.before
    const now = this.save.now
    const { next } = change
    // The client fields name the manual edit behind the current value and provenance: they carry over only when
    // neither changed (a silent refresh); a new value or a new origin (an import upgrading a manual record, a
    // replace) clears them
    const sameOrigin =
      before !== null &&
      !change.valueChanged &&
      before.provenance.source === next.provenance.source &&
      before.provenance.verification === next.provenance.verification
    const state: RecordState = {
      sheetId,
      achievement: next.achievement,
      comboFlag: next.comboFlag ?? null,
      syncFlag: next.syncFlag ?? null,
      dxScore: next.dxScore ?? null,
      best50Bucket: next.best50Bucket ?? null,
      providerRecordId: next.providerRecordId ?? null,
      provenance: { ...next.provenance },
      revision: change.bumpRevision || before === null ? ++this.revision : before.revision,
      valueChangedAt: change.valueChanged || before === null ? now : before.valueChangedAt,
      clientMutationId:
        change.clientMutationId !== undefined
          ? change.clientMutationId
          : sameOrigin
            ? (before?.clientMutationId ?? null)
            : null,
      clientEditedAt:
        change.clientEditedAt !== undefined
          ? change.clientEditedAt
          : sameOrigin
            ? (before?.clientEditedAt ?? null)
            : null,
      deletedAt: next.deleted ? (before?.deletedAt ?? now) : null,
    }
    this.states.set(sheetId, state)
    this.dirty.add(sheetId)
    this.liveDelta += change.liveDelta
    if (change.eventKind) this.events.push(eventOf(state, change.eventKind))
    return state
  }

  /** Records an event that changes no record (a `superseded` manual mutation) */
  addEvent(event: RecordEvent) {
    this.events.push(event)
  }

  /** Writes the buffered records and events */
  flush() {
    return Effect.gen({ self: this }, function* () {
      const rows = [...this.dirty].map((sheetId) => this.states.get(sheetId)!)
      this.dirty.clear()
      const events = this.events
      this.events = []
      for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
        yield* upsertRecords(this.database, this.save, rows.slice(offset, offset + WRITE_BATCH_SIZE))
      }
      for (let offset = 0; offset < events.length; offset += WRITE_BATCH_SIZE) {
        yield* insertEvents(this.database, this.save, events.slice(offset, offset + WRITE_BATCH_SIZE))
      }
    })
  }

  /** Flushes, then moves the save's revision and live record count */
  finish() {
    return Effect.gen({ self: this }, function* () {
      yield* this.flush()
      if (this.revision === this.startRevision && this.liveDelta === 0) return
      yield* this.database.raw(
        'CloudSave.advanceSave',
        `UPDATE score_saves SET revision = $2, record_count = record_count + $3, updated_at = $4 WHERE id = $1`,
        [this.save.id, this.revision, this.liveDelta, this.save.now],
      )
      this.save.revision = this.revision
      this.save.recordCount += this.liveDelta
    })
  }
}

const upsertRecords = (database: DatabaseService, save: LockedSave, rows: RecordState[]) =>
  database.raw(
    'CloudSave.upsertRecords',
    `INSERT INTO score_records (
       save_id, user_id, sheet_id, achievement, combo_flag, sync_flag, dx_score, best50_bucket, provider_record_id,
       source, claimed_source, fetched_by, verification, entry_method, source_account_id, import_job_id,
       raw_payload_sha256, fetched_at, edited_from_job_id, revision, client_mutation_id, value_changed_at,
       client_edited_at, deleted_at)
     SELECT $1, $2, r.sheet_id, r.achievement, r.combo_flag, r.sync_flag, r.dx_score, r.best50_bucket,
       r.provider_record_id, r.source, r.claimed_source, r.fetched_by, r.verification, r.entry_method,
       r.source_account_id, r.import_job_id, r.raw_payload_sha256, r.fetched_at, r.edited_from_job_id, r.revision,
       r.client_mutation_id, r.value_changed_at, r.client_edited_at, r.deleted_at
     FROM jsonb_to_recordset($3::jsonb) AS r(
       sheet_id text, achievement integer, combo_flag text, sync_flag text, dx_score integer, best50_bucket text,
       provider_record_id text, source text, claimed_source text, fetched_by text, verification text,
       entry_method text, source_account_id text, import_job_id text, raw_payload_sha256 text,
       fetched_at timestamptz, edited_from_job_id text, revision bigint, client_mutation_id text,
       value_changed_at timestamptz, client_edited_at timestamptz, deleted_at timestamptz)
     ON CONFLICT (save_id, sheet_id) DO UPDATE SET
       achievement = EXCLUDED.achievement, combo_flag = EXCLUDED.combo_flag, sync_flag = EXCLUDED.sync_flag,
       dx_score = EXCLUDED.dx_score, best50_bucket = EXCLUDED.best50_bucket,
       provider_record_id = EXCLUDED.provider_record_id, source = EXCLUDED.source,
       claimed_source = EXCLUDED.claimed_source, fetched_by = EXCLUDED.fetched_by,
       verification = EXCLUDED.verification, entry_method = EXCLUDED.entry_method,
       source_account_id = EXCLUDED.source_account_id, import_job_id = EXCLUDED.import_job_id,
       raw_payload_sha256 = EXCLUDED.raw_payload_sha256, fetched_at = EXCLUDED.fetched_at,
       edited_from_job_id = EXCLUDED.edited_from_job_id, revision = EXCLUDED.revision,
       client_mutation_id = EXCLUDED.client_mutation_id, value_changed_at = EXCLUDED.value_changed_at,
       client_edited_at = EXCLUDED.client_edited_at, deleted_at = EXCLUDED.deleted_at`,
    [
      save.id,
      save.userId,
      JSON.stringify(
        rows.map((row) => ({
          sheet_id: row.sheetId,
          achievement: row.achievement,
          combo_flag: row.comboFlag,
          sync_flag: row.syncFlag,
          dx_score: row.dxScore,
          best50_bucket: row.best50Bucket,
          provider_record_id: row.providerRecordId,
          source: row.provenance.source,
          claimed_source: row.provenance.claimedSource,
          fetched_by: row.provenance.fetchedBy,
          verification: row.provenance.verification,
          entry_method: row.provenance.entryMethod,
          source_account_id: row.provenance.sourceAccountId,
          import_job_id: row.provenance.importJobId,
          raw_payload_sha256: row.provenance.rawPayloadSha256,
          fetched_at: row.provenance.fetchedAt,
          edited_from_job_id: row.provenance.editedFromJobId,
          revision: row.revision,
          client_mutation_id: row.clientMutationId,
          value_changed_at: row.valueChangedAt.toISOString(),
          client_edited_at: iso(row.clientEditedAt),
          deleted_at: iso(row.deletedAt),
        })),
      ),
    ],
  )

const insertEvents = (database: DatabaseService, save: LockedSave, events: RecordEvent[]) =>
  database.raw(
    'CloudSave.insertEvents',
    `INSERT INTO score_record_events (
       save_id, user_id, sheet_id, kind, achievement, combo_flag, sync_flag, dx_score, best50_bucket, source,
       claimed_source, fetched_by, verification, entry_method, source_account_id, import_job_id, raw_payload_sha256,
       fetched_at, client_mutation_id, created_at)
     SELECT $1, $2, e.sheet_id, e.kind, e.achievement, e.combo_flag, e.sync_flag, e.dx_score, e.best50_bucket,
       e.source, e.claimed_source, e.fetched_by, e.verification, e.entry_method, e.source_account_id,
       e.import_job_id, e.raw_payload_sha256, e.fetched_at, e.client_mutation_id, $3
     FROM jsonb_to_recordset($4::jsonb) AS e(
       sheet_id text, kind text, achievement integer, combo_flag text, sync_flag text, dx_score integer,
       best50_bucket text, source text, claimed_source text, fetched_by text, verification text, entry_method text,
       source_account_id text, import_job_id text, raw_payload_sha256 text, fetched_at timestamptz,
       client_mutation_id text, ord integer)
     ORDER BY e.ord`,
    [
      save.id,
      save.userId,
      save.now,
      JSON.stringify(
        events.map((event, ord) => ({
          ord,
          sheet_id: event.sheetId,
          kind: event.kind,
          achievement: event.achievement,
          combo_flag: event.comboFlag,
          sync_flag: event.syncFlag,
          dx_score: event.dxScore,
          best50_bucket: event.best50Bucket,
          source: event.source,
          claimed_source: event.claimedSource,
          fetched_by: event.fetchedBy,
          verification: event.verification,
          entry_method: event.entryMethod,
          source_account_id: event.sourceAccountId,
          import_job_id: event.importJobId,
          raw_payload_sha256: event.rawPayloadSha256,
          fetched_at: event.fetchedAt,
          client_mutation_id: event.clientMutationId,
        })),
      ),
    ],
  )