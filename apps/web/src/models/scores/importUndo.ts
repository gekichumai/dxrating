import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import type { ImportChangeCounts } from './importPlan'
import type { ImportEntrySource, ImportMeta } from './ScoreRepository'

/**
 * The undo of the last import into the local save (meta#35): a snapshot of the save taken right before the import,
 * kept for {@link IMPORT_UNDO_WINDOW_MS} in the browser storage, so it survives a reload. Undoing writes the snapshot
 * back as it was.
 *
 * Local only. The snapshot holds the visitor's own local entries, which carry no provenance, and it never leaves the
 * browser. A cloud save takes no such snapshot: writing local entries back into it would send records server → client
 * → server and strip their provenance (meta#17). Its imports only merge (never lower or remove a score, design §5.3),
 * and an undo there would have to be server-side, from the import job's record events. Not to be confused with the
 * design's `score_save_snapshots`, which are rating summaries, not restorable saves.
 */

export const IMPORT_UNDO_STORAGE_KEY = 'rating-calculator-import-undo'
/** How long the last import can be undone */
export const IMPORT_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000
/**
 * The largest snapshot kept in the browser storage (UTF-16 code units, about 4 MB). A larger one would crowd out the
 * save itself in the ~5 MB origin quota, so it is kept in memory for this visit only. A save of a few thousand charts
 * is well under it.
 */
export const IMPORT_UNDO_MAX_PERSISTED_LENGTH = 2_000_000

export interface ImportUndoSnapshot {
  version: 1
  id: string
  /** Epoch milliseconds when the import was applied */
  createdAt: number
  source: ImportEntrySource
  mode: ImportMeta['mode']
  importedCount: number
  counts: ImportChangeCounts
  /** The save right before the import */
  previousEntries: PlayEntry[]
  /** `fingerprintEntries` of the save right after the import: a different save means it has changed since */
  appliedFingerprint: string
}

/** A short hash of a save (FNV-1a over its JSON), to tell whether it has changed since the import */
export function fingerprintEntries(entries: readonly PlayEntry[]): string {
  const json = JSON.stringify(entries)
  let hash = 0x811c9dc5
  for (let index = 0; index < json.length; index++) {
    hash ^= json.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${json.length.toString(36)}-${(hash >>> 0).toString(36)}`
}

const isSnapshot = (value: unknown): value is ImportUndoSnapshot => {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<ImportUndoSnapshot>
  return (
    snapshot.version === 1 &&
    typeof snapshot.id === 'string' &&
    typeof snapshot.createdAt === 'number' &&
    typeof snapshot.source === 'string' &&
    (snapshot.mode === 'merge' || snapshot.mode === 'replace') &&
    typeof snapshot.importedCount === 'number' &&
    !!snapshot.counts &&
    typeof snapshot.counts === 'object' &&
    Array.isArray(snapshot.previousEntries) &&
    typeof snapshot.appliedFingerprint === 'string'
  )
}

export interface ImportUndoStore {
  /** The snapshot of the last import while it can be undone; expired snapshots are dropped */
  get(): ImportUndoSnapshot | null
  /** Replaces the snapshot. `persisted` is false when the storage refused it: the undo then lasts for this visit only */
  save(snapshot: ImportUndoSnapshot): { persisted: boolean }
  clear(): void
  subscribe(cb: () => void): () => void
  /** When the snapshot can no longer be undone */
  expiresAt(snapshot: ImportUndoSnapshot): number
}

/**
 * The undo store of a save. With a storage, the snapshot is read from and written to it; without one (demos, tests,
 * a browser that refuses storage), it lives in memory for this visit.
 */
export function createImportUndoStore(storage: Storage | null, now: () => number = Date.now): ImportUndoStore {
  let memory: ImportUndoSnapshot | null = null
  let loaded = storage === null
  /** The parsed snapshot, cached by its raw value so `get()` is stable between changes */
  let cache: { raw: string; snapshot: ImportUndoSnapshot | null } | null = null
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }

  const read = (): ImportUndoSnapshot | null => {
    if (!loaded && storage) {
      loaded = true
      try {
        const raw = storage.getItem(IMPORT_UNDO_STORAGE_KEY)
        if (raw === null) {
          // Removed (undone or replaced in another tab): a snapshot read before is gone too
          memory = null
          cache = null
        } else {
          if (cache?.raw !== raw) {
            const parsed: unknown = JSON.parse(raw)
            cache = { raw, snapshot: isSnapshot(parsed) ? parsed : null }
          }
          memory = cache.snapshot
        }
      } catch {
        // Storage restrictions and invalid JSON: no undo
        memory = null
      }
    }
    return memory
  }

  const remove = () => {
    memory = null
    cache = null
    if (storage) {
      try {
        storage.removeItem(IMPORT_UNDO_STORAGE_KEY)
      } catch {
        // A restricted storage has nothing to remove
      }
    }
  }

  const expiresAt = (snapshot: ImportUndoSnapshot) => snapshot.createdAt + IMPORT_UNDO_WINDOW_MS

  // Another tab imported or undid (`key` is null when it cleared the whole storage)
  if (storage && typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== null && event.key !== IMPORT_UNDO_STORAGE_KEY) return
      loaded = false
      notify()
    })
  }

  return {
    get() {
      const snapshot = read()
      if (snapshot && now() >= expiresAt(snapshot)) {
        remove()
        return null
      }
      return snapshot
    },
    save(snapshot) {
      memory = snapshot
      loaded = true
      let persisted = false
      if (storage) {
        try {
          const raw = JSON.stringify(snapshot)
          if (raw.length > IMPORT_UNDO_MAX_PERSISTED_LENGTH) throw new RangeError('Import undo snapshot too large')
          storage.setItem(IMPORT_UNDO_STORAGE_KEY, raw)
          cache = { raw, snapshot }
          persisted = true
        } catch {
          // Full storage or an oversized snapshot: drop a stale snapshot so a reload cannot offer to undo an older import
          try {
            storage.removeItem(IMPORT_UNDO_STORAGE_KEY)
          } catch {
            // Restricted storage
          }
        }
      }
      notify()
      return { persisted }
    },
    clear() {
      remove()
      loaded = true
      notify()
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    expiresAt,
  }
}

/** Whether the save is still the one the import left: undoing then loses nothing done after the import */
export const isSaveUnchangedSinceImport = (snapshot: ImportUndoSnapshot, current: readonly PlayEntry[]): boolean =>
  fingerprintEntries(current) === snapshot.appliedFingerprint