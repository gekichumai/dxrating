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

/** One atomic write; applied in the order of its fields */
export interface CloudScoreWrite {
  /** Clears the save's `records` first (full refetch) */
  replaceRecords?: boolean
  putRecords?: readonly RecordDTO[]
  /** Returns the entries with their `seq` assigned */
  addOutbox?: readonly OutboxEntry[]
  deleteOutbox?: readonly string[]
  putIssues?: readonly SyncIssue[]
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

  async write(write: CloudScoreWrite): Promise<OutboxEntry[]> {
    const transaction = this.db.transaction([...STORES], 'readwrite')
    const done = transactionDone(transaction)
    const records = transaction.objectStore('records')
    const outbox = transaction.objectStore('outbox')
    const issues = transaction.objectStore('issues')

    const putRecords = () => {
      for (const record of write.putRecords ?? [])
        records.put({ ...record, saveId: this.saveId } satisfies StoredRecord)
    }
    if (write.replaceRecords) {
      // This save's records only; the puts follow once they are gone
      const keys = records.index(SAVE_INDEX).getAllKeys(this.saveId)
      keys.onsuccess = () => {
        for (const key of keys.result) records.delete(key)
        putRecords()
      }
    } else {
      putRecords()
    }

    const added: Promise<OutboxEntry>[] = []
    for (const entry of write.addOutbox ?? []) {
      const { seq: _seq, ...withoutSeq } = entry
      added.push(requestToPromise(outbox.add(withoutSeq)).then((seq) => ({ ...withoutSeq, seq: Number(seq) })))
    }
    if (write.deleteOutbox?.length) {
      const index = outbox.index('mutationId')
      for (const mutationId of write.deleteOutbox) {
        const request = index.getKey(mutationId)
        request.onsuccess = () => {
          if (request.result !== undefined) outbox.delete(request.result)
        }
      }
    }

    for (const issue of write.putIssues ?? []) issues.put(issue)
    for (const id of write.deleteIssues ?? []) issues.delete(id)
    if (write.meta) transaction.objectStore('meta').put({ ...write.meta, saveId: this.saveId }, this.saveId)

    const [addedEntries] = await Promise.all([Promise.all(added), done])
    return addedEntries
  }

  close() {
    this.db.close()
  }
}