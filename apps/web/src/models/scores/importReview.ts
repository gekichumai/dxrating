import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { isRiskyPlan, planImport, type ImportPlan } from './importPlan'
import {
  createImportUndoStore,
  fingerprintEntries,
  isSaveUnchangedSinceImport,
  type ImportUndoSnapshot,
  type ImportUndoStore,
} from './importUndo'
import { LocalScoreRepository } from './LocalScoreRepository'
import type { ImportMeta, ScoreRepository, WebScoreRepository } from './ScoreRepository'

/**
 * Imports into the local save go through here (meta#35): the import is previewed, the visitor confirms it, the save is
 * snapshotted, then the import is applied. `ImportReviewHost` shows the preview; `ImportUndoBanner` offers the undo.
 */

/** `manual`: the visitor started it and always sees the preview. `automatic`: asks only when it would lose a score */
export type ImportTrigger = 'manual' | 'automatic'

export interface ImportReviewRequest {
  id: number
  plan: ImportPlan
  trigger: ImportTrigger
  resolve: (confirmed: boolean) => void
}

type Listener = () => void

/** The preview waiting for the visitor; one at a time, a newer request cancels the one before */
export class ImportReviewController {
  private current: ImportReviewRequest | null = null
  private nextId = 1
  private readonly listeners = new Set<Listener>()

  getRequest = (): ImportReviewRequest | null => this.current

  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /** Resolves `true` when the visitor confirms, `false` when they cancel */
  requestReview(plan: ImportPlan, trigger: ImportTrigger): Promise<boolean> {
    this.current?.resolve(false)
    return new Promise<boolean>((resolve) => {
      const request: ImportReviewRequest = {
        id: this.nextId++,
        plan,
        trigger,
        resolve: (confirmed) => {
          if (this.current?.id === request.id) {
            this.current = null
            this.notify()
          }
          resolve(confirmed)
        },
      }
      this.current = request
      this.notify()
    })
  }

  private notify() {
    for (const listener of [...this.listeners]) listener()
  }
}

/** The controller `ImportReviewHost` renders */
export const importReviewController = new ImportReviewController()

const undoStores = new WeakMap<object, ImportUndoStore>()

const browserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * The undo store of a repository, or `null` when it cannot undo (a cloud save keeps its own snapshots). The visitor's
 * save keeps its snapshot in the browser storage; an in-memory save (demo, test) keeps it in memory.
 */
export function getImportUndoStore(repository: ScoreRepository): ImportUndoStore | null {
  if (!(repository instanceof LocalScoreRepository)) return null
  let store = undoStores.get(repository)
  if (!store) {
    store = createImportUndoStore(repository.persistent ? browserStorage() : null)
    undoStores.set(repository, store)
  }
  return store
}

export interface ReviewedImportResult {
  applied: boolean
  plan: ImportPlan
  /** Whether the import can be undone after a reload (false: for this visit only, or not at all) */
  undoPersisted: boolean
}

export interface ReviewAndApplyOptions {
  trigger: ImportTrigger
  controller?: ImportReviewController
  now?: () => number
}

const newSnapshotId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/**
 * Previews an import, waits for the visitor to confirm it (see {@link ImportTrigger}), snapshots the save and applies
 * it. A save without an undo store (cloud) is imported as before: it confirms imports on its own.
 */
export async function reviewAndApplyImport(
  repository: WebScoreRepository,
  entries: PlayEntry[],
  meta: ImportMeta,
  { trigger, controller = importReviewController, now = Date.now }: ReviewAndApplyOptions,
): Promise<ReviewedImportResult> {
  const previousEntries = repository.entries()
  const plan = planImport(previousEntries, entries, meta)
  const undoStore = getImportUndoStore(repository)
  if (!undoStore) {
    await repository.applyImport(entries, meta)
    return { applied: true, plan, undoPersisted: false }
  }

  const needsReview = trigger === 'manual' || isRiskyPlan(plan)
  if (needsReview && !(await controller.requestReview(plan, trigger))) {
    return { applied: false, plan, undoPersisted: false }
  }

  // The save may have changed while the preview was open (another tab, an automatic import): preview it again
  const latestEntries = repository.entries()
  const appliedPlan = latestEntries === previousEntries ? plan : planImport(latestEntries, entries, meta)

  await repository.applyImport(entries, meta)
  const snapshot: ImportUndoSnapshot = {
    version: 1,
    id: newSnapshotId(),
    createdAt: now(),
    source: meta.source,
    mode: meta.mode,
    importedCount: entries.length,
    counts: appliedPlan.counts,
    previousEntries: [...latestEntries],
    appliedFingerprint: fingerprintEntries(repository.entries()),
  }
  const { persisted } = undoStore.save(snapshot)
  return { applied: true, plan: appliedPlan, undoPersisted: persisted }
}

/** Whether undoing would also discard changes made after the import */
export function undoDiscardsLaterChanges(repository: WebScoreRepository, snapshot: ImportUndoSnapshot): boolean {
  return !isSaveUnchangedSinceImport(snapshot, repository.entries())
}

/** Puts back the save from before the last import; `false` when there is nothing to undo */
export function undoLastImport(repository: WebScoreRepository): boolean {
  const store = getImportUndoStore(repository)
  const snapshot = store?.get()
  if (!store || !snapshot || !(repository instanceof LocalScoreRepository)) return false
  repository.restoreImportSnapshot(snapshot.previousEntries)
  store.clear()
  return true
}