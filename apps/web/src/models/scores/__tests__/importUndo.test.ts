import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import {
  createImportUndoStore,
  fingerprintEntries,
  IMPORT_UNDO_MAX_PERSISTED_LENGTH,
  IMPORT_UNDO_STORAGE_KEY,
  IMPORT_UNDO_WINDOW_MS,
  isSaveUnchangedSinceImport,
  type ImportUndoSnapshot,
} from '../importUndo'

const ENTRIES: PlayEntry[] = [{ sheetId: 'a', achievementRate: 99 }]

const snapshot = (overrides: Partial<ImportUndoSnapshot> = {}): ImportUndoSnapshot => ({
  version: 1,
  id: 'snap-1',
  createdAt: 1_000,
  source: 'lxns',
  mode: 'replace',
  importedCount: 3,
  counts: { added: 1, improved: 1, unchanged: 0, lowered: 0, removed: 1 },
  previousEntries: ENTRIES,
  appliedFingerprint: fingerprintEntries([]),
  ...overrides,
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('fingerprintEntries', () => {
  it('is the same for the same save and differs when it changes', () => {
    expect(fingerprintEntries(ENTRIES)).toBe(fingerprintEntries([{ sheetId: 'a', achievementRate: 99 }]))
    expect(fingerprintEntries(ENTRIES)).not.toBe(fingerprintEntries([{ sheetId: 'a', achievementRate: 99.1 }]))
    expect(isSaveUnchangedSinceImport(snapshot(), [])).toBe(true)
    expect(isSaveUnchangedSinceImport(snapshot(), ENTRIES)).toBe(false)
  })
})

describe('createImportUndoStore', () => {
  it('keeps the snapshot in the storage, so a new store (a reload) reads it back', () => {
    const now = () => 2_000
    const first = createImportUndoStore(localStorage, now)
    expect(first.save(snapshot())).toEqual({ persisted: true })
    expect(JSON.parse(localStorage.getItem(IMPORT_UNDO_STORAGE_KEY)!)).toEqual(snapshot())

    const reloaded = createImportUndoStore(localStorage, now)
    expect(reloaded.get()).toEqual(snapshot())
    // Stable between changes, for useSyncExternalStore
    expect(reloaded.get()).toBe(reloaded.get())
  })

  it('drops the snapshot once the undo window has passed', () => {
    let time = 1_000
    const store = createImportUndoStore(localStorage, () => time)
    store.save(snapshot())
    expect(store.expiresAt(snapshot())).toBe(1_000 + IMPORT_UNDO_WINDOW_MS)
    time = 1_000 + IMPORT_UNDO_WINDOW_MS - 1
    expect(store.get()).not.toBeNull()
    time = 1_000 + IMPORT_UNDO_WINDOW_MS
    expect(store.get()).toBeNull()
    expect(localStorage.getItem(IMPORT_UNDO_STORAGE_KEY)).toBeNull()
  })

  it('ignores a malformed or foreign value', () => {
    localStorage.setItem(IMPORT_UNDO_STORAGE_KEY, '{"version":2}')
    expect(createImportUndoStore(localStorage, () => 0).get()).toBeNull()
    localStorage.setItem(IMPORT_UNDO_STORAGE_KEY, 'not json')
    expect(createImportUndoStore(localStorage, () => 0).get()).toBeNull()
  })

  it('keeps the undo for this visit when the storage refuses the snapshot, and drops an older one', () => {
    const values = new Map<string, string>()
    let full = false
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (full) throw new DOMException('full', 'QuotaExceededError')
        values.set(key, value)
      },
      removeItem: (key: string) => values.delete(key),
    } as unknown as Storage
    const store = createImportUndoStore(storage, () => 2_000)
    store.save(snapshot({ id: 'older' }))
    full = true
    expect(store.save(snapshot({ id: 'newer' }))).toEqual({ persisted: false })
    expect(store.get()?.id).toBe('newer')
    expect(values.has(IMPORT_UNDO_STORAGE_KEY)).toBe(false)
  })

  it('keeps an oversized snapshot in memory only', () => {
    const store = createImportUndoStore(localStorage, () => 2_000)
    const huge = snapshot({
      previousEntries: [{ sheetId: 'x'.repeat(IMPORT_UNDO_MAX_PERSISTED_LENGTH), achievementRate: 99 }],
    })
    expect(store.save(huge)).toEqual({ persisted: false })
    expect(store.get()).toBe(huge)
    expect(localStorage.getItem(IMPORT_UNDO_STORAGE_KEY)).toBeNull()
  })

  it('forgets a snapshot another tab removed or cleared', () => {
    const first = createImportUndoStore(localStorage, () => 2_000)
    const second = createImportUndoStore(localStorage, () => 2_000)
    first.save(snapshot())
    expect(second.get()).toEqual(snapshot())
    const listener = vi.fn()
    second.subscribe(listener)

    first.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: IMPORT_UNDO_STORAGE_KEY, newValue: null }))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(second.get()).toBeNull()

    first.save(snapshot({ id: 'again' }))
    window.dispatchEvent(new StorageEvent('storage', { key: IMPORT_UNDO_STORAGE_KEY }))
    expect(second.get()?.id).toBe('again')
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(second.get()).toBeNull()
  })

  it('lives in memory without a storage', () => {
    const store = createImportUndoStore(null, () => 2_000)
    expect(store.save(snapshot())).toEqual({ persisted: false })
    expect(store.get()).toEqual(snapshot())
    expect(localStorage.getItem(IMPORT_UNDO_STORAGE_KEY)).toBeNull()
  })

  it('notifies subscribers on save and clear', () => {
    const store = createImportUndoStore(localStorage, () => 2_000)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.save(snapshot())
    store.clear()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.get()).toBeNull()
    unsubscribe()
    store.save(snapshot())
    expect(listener).toHaveBeenCalledTimes(2)
  })
})