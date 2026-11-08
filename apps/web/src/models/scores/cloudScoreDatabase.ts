import type { ManualEntryMethod } from '@gekichumai/maimai-domain'
import type { RecordDTO, SetValue } from '@gekichumai/api-contract'
import type { SyncIssue } from './ScoreRepository'

/**
 * The IndexedDB cache of one user's cloud saves (design §8.1): `dxr-cloud-v1-<userId>`, so one user's records, outbox
 * and issues never mix with another's. A small promise wrapper over the raw API (no dependency). An instance reads and
 * writes the cache of one save: two tabs on different saves of the same user never touch each other's records.
 *
 * - `records`: the server's records (tombstones included), by `[saveId, sheetId]`
 * - `outbox`: mutations not yet acknowledged by the server, in creation order (auto-increment `seq`), each with the
 *   save it belongs to; never deleted on logout or when cloud save is turned off (§5.7)
 * - `meta`: `{ saveId, lastSyncedRevision }` under the save's ID
 * - `issues`: sync issues (superseded or rejected mutations), by ID, each with the save it belongs to; kept for
 *   other saves like their outbox entries
 */

/** 2: `records` and `meta` keyed by save (version 1 held one save's cache; it is dropped and refetched) */
export const CLOUD_SCORE_DB_VERSION = 2

export const cloudScoreDatabaseName = (userId: string) => `dxr-cloud-v1-${userId}`

/** A mutation waiting for the server, persisted with its ID so a retry is idempotent (§5.5) */
export interface OutboxEntry {
  /** Creation order across tabs; assigned by IndexedDB */
  seq?: number
  mutationId: string
  saveId: string
  op: 'set' | 'delete'
  sheetId: string
  /** The server revision of the record the user saw when making the change (0 when there was none) */
  basedOnRevision: number
  value?: SetValue
  entryMethod: ManualEntryMethod
  /** Device clock, display only */
  clientEditedAt: string
}

export interface CloudScoreMeta {
  saveId: string | null
  /** The `nextSince` of the last complete pull */
  lastSyncedRevision: number
}

export interface CloudScoreSnapshot {
  meta: CloudScoreMeta
  records: RecordDTO[]
  outbox: OutboxEntry[]
  issues: SyncIssue[]
}

/**
 * One atomic write; applied in the order of its fields.
 *
 * Server records are revision-guarded inside the transaction: a record (or tombstone) is written only when its
 * `revision` is at least the cached one. Without Web Locks every tab syncs on its own, so a push result one tab got
 * late must never overwrite a newer record another tab already cached: the shared cursor has moved past it, so no
 * later pull would bring the newer one back, and the `count`/`sumAchievement` checksum (all the contract carries)
 * cannot tell two revisions of one record with the same achievement apart. With the guard the cache only ever moves
 * forward per record, so a record is stale only until the pull that covers its newer revision.
 */
export interface CloudScoreWriteResult {
  /** The `addOutbox` entries with their `seq` assigned */
  added: OutboxEntry[]
  /** The `acknowledgeIssues` written, those whose outbox entry this write removed */
  acknowledgedIssues: SyncIssue[]
}

export interface CloudScoreWrite {
  /**
   * A full refetch: drops the save's cached records up to `throughRevision` (the cursor of the full pull) that
   * `putRecords` does not hold. Records cached with a higher revision (another tab wrote them after the pull's
   * snapshot) are kept.
   */
  replaceRecords?: { throughRevision: number }
  /** Each written only if it is not older than the cached record */
  putRecords?: readonly RecordDTO[]
  /** Returns the entries with their `seq` assigned */
  addOutbox?: readonly OutboxEntry[]
  deleteOutbox?: readonly string[]
  putIssues?: readonly SyncIssue[]
  /**
   * The issues of acknowledged outbox entries (`issue.id` is the entry's `mutationId`, which `deleteOutbox` lists):
   * each is written only if this transaction removes its entry. A duplicate acknowledgement (two tabs sent the same
   * entry) finds the entry gone and never brings back an issue the user dismissed or applied again meanwhile.
   */
  acknowledgeIssues?: readonly SyncIssue[]
  deleteIssues?: readonly string[]
  meta?: CloudScoreMeta
}

const STORES = ['records', 'outbox', 'meta', 'issues'] as const
const SAVE_INDEX = 'saveId'

/** A record as stored: with the save it belongs to */
type StoredRecord = RecordDTO & { saveId: string }

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export class CloudScoreDatabase {
  private constructor(
    private readonly db: IDBDatabase,
    readonly saveId: string,
  ) {}

  /** Opens the user's database, reading and writing the cache of `saveId` */
  static async open(
    userId: string,
    saveId: string,
    factory: IDBFactory = globalThis.indexedDB,
  ): Promise<CloudScoreDatabase> {
    if (!factory) throw new Error('IndexedDB is not available')
    const request = factory.open(cloudScoreDatabaseName(userId), CLOUD_SCORE_DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      // Version 1 kept one save's cache under a single key: a cache only, refetched from the server
      if (event.oldVersion < 2) {
        if (db.objectStoreNames.contains('records')) db.deleteObjectStore('records')
        if (db.objectStoreNames.contains('meta')) db.deleteObjectStore('meta')
      }
      if (!db.objectStoreNames.contains('records')) {
        const records = db.createObjectStore('records', { keyPath: ['saveId', 'sheetId'] })
        records.createIndex(SAVE_INDEX, 'saveId')
      }
      if (!db.objectStoreNames.contains('outbox')) {
        const outbox = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
        outbox.createIndex('mutationId', 'mutationId', { unique: true })
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('issues')) db.createObjectStore('issues', { keyPath: 'id' })
    }
    const db = await requestToPromise(request)
    // Another tab upgrading the schema later: let it, this tab reopens on its next load
    db.onversionchange = () => db.close()
    return new CloudScoreDatabase(db, saveId)
  }

  async read(): Promise<CloudScoreSnapshot> {
    const transaction = this.db.transaction([...STORES], 'readonly')
    const [records, outbox, meta, issues] = await Promise.all([
      requestToPromise(
        transaction.objectStore('records').index(SAVE_INDEX).getAll(this.saveId) as IDBRequest<StoredRecord[]>,
      ),
      requestToPromise(transaction.objectStore('outbox').getAll() as IDBRequest<OutboxEntry[]>),
      requestToPromise(transaction.objectStore('meta').get(this.saveId) as IDBRequest<CloudScoreMeta | undefined>),
      requestToPromise(transaction.objectStore('issues').getAll() as IDBRequest<SyncIssue[]>),
    ])
    return {
      meta: meta ?? { saveId: this.saveId, lastSyncedRevision: 0 },
      records: records.map(({ saveId: _saveId, ...record }) => record),
      outbox: outbox.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
      issues: issues.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }
  }

  async readOutbox(): Promise<OutboxEntry[]> {
    const transaction = this.db.transaction('outbox', 'readonly')
    const outbox = await requestToPromise(transaction.objectStore('outbox').getAll() as IDBRequest<OutboxEntry[]>)
    return outbox.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  }

  async write(write: CloudScoreWrite): Promise<CloudScoreWriteResult> {
    const transaction = this.db.transaction([...STORES], 'readwrite')
    const done = transactionDone(transaction)
    const records = transaction.objectStore('records')
    const outbox = transaction.objectStore('outbox')
    const issues = transaction.objectStore('issues')

    const incoming = new Map<string, RecordDTO>()
    for (const record of write.putRecords ?? []) {
      const existing = incoming.get(record.sheetId)
      if (!existing || record.revision >= existing.revision) incoming.set(record.sheetId, record)
    }
    // Read what is cached and write in the same transaction: no other tab can write in between
    const putIfNotOlder = (record: RecordDTO, existing: StoredRecord | undefined) => {
      if (existing && existing.revision > record.revision) return
      records.put({ ...record, saveId: this.saveId } satisfies StoredRecord)
    }
    if (write.replaceRecords) {
      const { throughRevision } = write.replaceRecords
      const cached = records.index(SAVE_INDEX).getAll(this.saveId) as IDBRequest<StoredRecord[]>
      cached.onsuccess = () => {
        const bySheetId = new Map(cached.result.map((record) => [record.sheetId, record]))
        for (const record of cached.result) {
          if (!incoming.has(record.sheetId) && record.revision <= throughRevision) {
            records.delete([this.saveId, record.sheetId])
          }
        }
        for (const record of incoming.values()) putIfNotOlder(record, bySheetId.get(record.sheetId))
      }
    } else {
      for (const record of incoming.values()) {
        const cached = records.get([this.saveId, record.sheetId]) as IDBRequest<StoredRecord | undefined>
        cached.onsuccess = () => putIfNotOlder(record, cached.result)
      }
    }

    const added: Promise<OutboxEntry>[] = []
    for (const entry of write.addOutbox ?? []) {
      const { seq: _seq, ...withoutSeq } = entry
      added.push(requestToPromise(outbox.add(withoutSeq)).then((seq) => ({ ...withoutSeq, seq: Number(seq) })))
    }
    for (const issue of write.putIssues ?? []) issues.put(issue)
    for (const id of write.deleteIssues ?? []) issues.delete(id)

    const acknowledgedIssues: SyncIssue[] = []
    if (write.deleteOutbox?.length) {
      const issueByMutationId = new Map((write.acknowledgeIssues ?? []).map((issue) => [issue.id, issue]))
      const index = outbox.index('mutationId')
      for (const mutationId of write.deleteOutbox) {
        const request = index.getKey(mutationId)
        request.onsuccess = () => {
          if (request.result === undefined) return
          outbox.delete(request.result)
          const issue = issueByMutationId.get(mutationId)
          if (issue) {
            issues.put(issue)
            acknowledgedIssues.push(issue)
          }
        }
      }
    }
    if (write.meta) transaction.objectStore('meta').put({ ...write.meta, saveId: this.saveId }, this.saveId)

    const [addedEntries] = await Promise.all([Promise.all(added), done])
    return { added: addedEntries, acknowledgedIssues }
  }

  close() {
    this.db.close()
  }
}