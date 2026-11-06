import { toAchievementInt, type ManualEntryMethod, type SheetIdentity } from '@gekichumai/maimai-domain'
import { RATING_ENTRIES_STORAGE_KEY } from '../../catalog/savedDataMigration'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import {
  type ImportMeta,
  type ImportProgress,
  type ImportResult,
  type ManualEntry,
  type ScoreRecord,
  type ScoreRepositoryStatus,
  type ServerImportKind,
  UnsupportedScoreOperationError,
  type WebScoreRepository,
} from './ScoreRepository'
import { collapseScoreRecordList, type InternalLevelResolver } from './collapseScoreRecords'

/** The identity of a sheet in the catalog, or nothing while the catalog is loading or the sheet is unknown */
export type SheetIdentityResolver = (sheetId: string) => SheetIdentity | null | undefined

const LOCAL_STATUS: ScoreRepositoryStatus = Object.freeze({
  state: 'idle',
  pendingCount: 0,
  lastSyncedRevision: 0,
  issues: Object.freeze([]),
})

const EMPTY_ENTRIES: readonly PlayEntry[] = Object.freeze([])

/** Reads the saved entries; a missing, unreadable or malformed value reads as no entries */
export function readStoredEntries(storage: Storage | null): readonly PlayEntry[] {
  if (!storage) return EMPTY_ENTRIES
  try {
    const stored = storage.getItem(RATING_ENTRIES_STORAGE_KEY)
    if (stored === null) return EMPTY_ENTRIES
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as PlayEntry[]) : EMPTY_ENTRIES
  } catch {
    // Storage restrictions (private mode) and invalid JSON
    return EMPTY_ENTRIES
  }
}

/** The record of a saved entry, or `null` when it has no known identity or no valid achievement */
export function playEntryToScoreRecord(
  entry: PlayEntry,
  resolveIdentity: SheetIdentityResolver | null,
): ScoreRecord | null {
  if (!entry || typeof entry.sheetId !== 'string') return null
  const identity = entry.identity ?? resolveIdentity?.(entry.sheetId) ?? null
  if (!identity) return null
  const achievement = typeof entry.achievementRate === 'number' ? toAchievementInt(entry.achievementRate) : null
  if (achievement === null) return null

  return {
    sheetId: entry.sheetId,
    identity,
    achievement,
    achievementRate: entry.achievementRate,
    comboFlag: entry.comboFlag ?? null,
    syncFlag: entry.syncFlag ?? null,
    dxScore: typeof entry.dxScore === 'number' ? entry.dxScore : null,
    // Only Diving-Fish reports the best 50 bucket, and `calculateBest50` honours no other provider's hint
    best50Bucket:
      entry.providerConfig?.divingFish?.ratingEligibility ??
      (entry.source?.provider === 'diving-fish' ? entry.source.best50Bucket : undefined) ??
      null,
    provenance: null,
  }
}

/** The maimai NET merge: new charts are added, a higher achievement replaces the saved values of its chart */
export function mergeImportedEntries(current: readonly PlayEntry[], imported: readonly PlayEntry[]): PlayEntry[] {
  const merged = [...current]
  for (const entry of imported) {
    const index = merged.findIndex((item) => item.sheetId === entry.sheetId)
    if (index < 0) {
      merged.push(entry)
      continue
    }
    const existing = merged[index]!
    if (entry.achievementRate > existing.achievementRate) {
      // The score values move together; everything else of the saved entry (identity, source) stays
      const updated: PlayEntry = {
        ...existing,
        achievementRate: entry.achievementRate,
        comboFlag: entry.comboFlag,
        syncFlag: entry.syncFlag,
      }
      if (entry.dxScore === undefined) delete updated.dxScore
      else updated.dxScore = entry.dxScore
      merged[index] = updated
    }
  }
  return merged
}

/** The saved entries an import leaves: `merge` keeps the save and adds or raises charts, `replace` becomes the save */
export function nextEntriesForImport(
  current: readonly PlayEntry[],
  imported: readonly PlayEntry[],
  mode: ImportMeta['mode'],
): PlayEntry[] {
  return mode === 'merge' ? mergeImportedEntries(current, imported) : [...imported]
}

/**
 * The local save: the entries under `localStorage['rating-calculator-entries']`, in the format the web has always
 * written (existing saves load unchanged). Every write replaces the whole key, as before. Without a storage (SSR,
 * or a browser that refuses it) the save lives in memory only and starts empty.
 */
export class LocalScoreRepository implements WebScoreRepository {
  readonly kind = 'local' as const
  readonly status = LOCAL_STATUS
  /** The save is read synchronously when the repository is created */
  readonly ready = true

  private currentEntries: readonly PlayEntry[]
  private records: readonly ScoreRecord[] | null = null
  private recordsBySheetId: Map<string, ScoreRecord> | null = null
  private resolveIdentity: SheetIdentityResolver | null = null
  private resolveInternalLevel: InternalLevelResolver | null = null
  private readonly listeners = new Set<() => void>()

  constructor(private readonly storage: Storage | null) {
    this.currentEntries = readStoredEntries(storage)
  }

  /** A save that lives in memory only, starting with `entries` (fixtures for dev and preview demos, tests) */
  static inMemory(entries: readonly PlayEntry[]): LocalScoreRepository {
    const repository = new LocalScoreRepository(null)
    repository.currentEntries = entries
    return repository
  }

  entries(): readonly PlayEntry[] {
    return this.currentEntries
  }

  /** One record per chart: duplicate entries of a chart are collapsed field by field (`collapseScoreRecords`) */
  list(): readonly ScoreRecord[] {
    if (!this.records) {
      const records: ScoreRecord[] = []
      for (const entry of this.currentEntries) {
        const record = playEntryToScoreRecord(entry, this.resolveIdentity)
        if (record) records.push(record)
      }
      const bySheetId = collapseScoreRecordList(records, this.resolveInternalLevel)
      this.records = Object.freeze([...bySheetId.values()])
      this.recordsBySheetId = bySheetId
    }
    return this.records
  }

  get(sheetId: string): ScoreRecord | undefined {
    this.list()
    return this.recordsBySheetId!.get(sheetId)
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /** Fills in the identity of records whose saved entry has none (the catalog loads after the save) */
  setIdentityResolver(resolveIdentity: SheetIdentityResolver | null) {
    if (this.resolveIdentity === resolveIdentity) return
    this.resolveIdentity = resolveIdentity
    this.invalidateRecords()
    this.notify()
  }

  /** Ranks the best 50 hints of duplicate entries by rating (`collapseScoreRecords`); by achievement without it */
  setInternalLevelResolver(resolveInternalLevel: InternalLevelResolver | null) {
    if (this.resolveInternalLevel === resolveInternalLevel) return
    this.resolveInternalLevel = resolveInternalLevel
    this.invalidateRecords()
    this.notify()
  }

  setManual(entry: ManualEntry, _method: ManualEntryMethod): void {
    // The local save keeps no provenance, so the entry method is not recorded. The entry replaces the saved one of
    // its chart as a whole, as the calculator always did
    const index = this.currentEntries.findIndex((existing) => existing.sheetId === entry.sheetId)
    if (index >= 0) {
      const next = [...this.currentEntries]
      next[index] = entry
      this.write(next)
    } else {
      this.write([...this.currentEntries, entry])
    }
  }

  delete(sheetIds: string[]): void {
    const removed = new Set(sheetIds)
    this.write(this.currentEntries.filter((entry) => !removed.has(entry.sheetId)))
  }

  clear(): void {
    this.write([])
  }

  async applyImport(entries: PlayEntry[], meta: ImportMeta): Promise<ImportResult> {
    // Written before the promise settles, so the import is visible as soon as this returns
    // `planImport` previews exactly this result
    this.write(nextEntriesForImport(this.currentEntries, entries, meta.mode))
    return { count: entries.length }
  }

  runServerImport(kind: ServerImportKind, _args: Record<string, unknown>): AsyncIterable<ImportProgress> {
    throw new UnsupportedScoreOperationError(`Server import (${kind})`, this.kind)
  }

  /** @internal The saved data migrations (legacy sheet IDs); not a user action */
  applyMigration(entries: readonly PlayEntry[]) {
    this.write(entries)
  }

  /** Whether the save is kept in the browser storage (the visitor's save), not in memory only (demos, tests) */
  get persistent(): boolean {
    return this.storage !== null
  }

  /** @internal Puts back the entries saved before an import (`importUndo`); the local save keeps no provenance */
  restoreImportSnapshot(entries: readonly PlayEntry[]) {
    this.write(entries)
  }

  /** @internal Wholesale replacement, for the `modifyEntries` compatibility adapter only */
  replaceEntries(entries: readonly PlayEntry[]) {
    this.write(entries)
  }

  private write(entries: readonly PlayEntry[]) {
    this.currentEntries = entries
    this.invalidateRecords()
    if (this.storage) {
      try {
        this.storage.setItem(RATING_ENTRIES_STORAGE_KEY, JSON.stringify(entries))
      } catch {
        // A full or restricted storage keeps the change in memory for this visit, as before
      }
    }
    this.notify()
  }

  private invalidateRecords() {
    this.records = null
    this.recordsBySheetId = null
  }

  private notify() {
    for (const listener of [...this.listeners]) listener()
  }
}