import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { fingerprintEntries } from '../importUndo'
import {
  getImportUndoStore,
  ImportReviewController,
  reviewAndApplyImport,
  undoDiscardsLaterChanges,
  undoLastImport,
} from '../importReview'
import { LocalScoreRepository } from '../LocalScoreRepository'
import type { WebScoreRepository } from '../ScoreRepository'

const SAVE: PlayEntry[] = [
  { sheetId: 'a', achievementRate: 100.5, comboFlag: 'ap' },
  { sheetId: 'b', achievementRate: 99 },
]
const IMPORTED: PlayEntry[] = [
  { sheetId: 'a', achievementRate: 100.6, comboFlag: 'ap' },
  { sheetId: 'c', achievementRate: 98 },
]

/** Answers every preview with `answer` and records it */
const answering = (answer: boolean) => {
  const controller = new ImportReviewController()
  const reviewed: string[] = []
  controller.subscribe(() => {
    const request = controller.getRequest()
    if (!request) return
    reviewed.push(request.trigger)
    request.resolve(answer)
  })
  return { controller, reviewed }
}

describe('reviewAndApplyImport', () => {
  it('applies a confirmed import and snapshots the save from before it', async () => {
    const repository = LocalScoreRepository.inMemory(SAVE)
    const { controller, reviewed } = answering(true)
    const appliedAt = Date.now()
    const result = await reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'lxns', mode: 'replace' },
      { trigger: 'manual', controller, now: () => appliedAt },
    )
    expect(reviewed).toEqual(['manual'])
    expect(result.applied).toBe(true)
    expect(result.plan.counts).toEqual({ added: 1, improved: 1, unchanged: 0, lowered: 0, removed: 1 })
    expect(repository.entries()).toEqual(IMPORTED)

    const snapshot = getImportUndoStore(repository)!.get()!
    expect(snapshot).toMatchObject({ source: 'lxns', mode: 'replace', importedCount: 2, createdAt: appliedAt })
    expect(snapshot.previousEntries).toEqual(SAVE)
    expect(snapshot.appliedFingerprint).toBe(fingerprintEntries(IMPORTED))
  })

  it('leaves the save as it was when the visitor cancels', async () => {
    const repository = LocalScoreRepository.inMemory(SAVE)
    const { controller } = answering(false)
    const result = await reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'lxns', mode: 'replace' },
      { trigger: 'manual', controller },
    )
    expect(result.applied).toBe(false)
    expect(repository.entries()).toBe(SAVE)
    expect(getImportUndoStore(repository)!.get()).toBeNull()
  })

  it('applies an automatic import that loses nothing without asking, and still keeps the undo', async () => {
    const repository = LocalScoreRepository.inMemory(SAVE)
    const { controller, reviewed } = answering(false)
    const result = await reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'maimai-net', mode: 'merge' },
      { trigger: 'automatic', controller },
    )
    expect(reviewed).toEqual([])
    expect(result.applied).toBe(true)
    expect(getImportUndoStore(repository)!.get()?.previousEntries).toEqual(SAVE)
  })

  it('asks before an automatic import that would remove charts', async () => {
    const repository = LocalScoreRepository.inMemory(SAVE)
    const { controller, reviewed } = answering(false)
    const result = await reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'maimai-net', mode: 'replace' },
      { trigger: 'automatic', controller },
    )
    expect(reviewed).toEqual(['automatic'])
    expect(result.applied).toBe(false)
    expect(repository.entries()).toBe(SAVE)
  })

  it('snapshots the save as it is when the import is applied, not when the preview opened', async () => {
    const repository = LocalScoreRepository.inMemory(SAVE)
    const controller = new ImportReviewController()
    controller.subscribe(() => {
      const request = controller.getRequest()
      if (!request) return
      // Changed in another tab while the preview is open
      repository.setManual({ sheetId: 'b', achievementRate: 99.5 }, 'typed')
      request.resolve(true)
    })
    await reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'lxns', mode: 'replace' },
      { trigger: 'manual', controller },
    )
    expect(getImportUndoStore(repository)!.get()!.previousEntries).toContainEqual({
      sheetId: 'b',
      achievementRate: 99.5,
    })
  })

  it('cancels a pending preview when a newer import asks', async () => {
    const controller = new ImportReviewController()
    const repository = LocalScoreRepository.inMemory(SAVE)
    const first = reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'lxns', mode: 'replace' },
      {
        trigger: 'manual',
        controller,
      },
    )
    const second = reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'diving-fish', mode: 'replace' },
      {
        trigger: 'manual',
        controller,
      },
    )
    expect((await first).applied).toBe(false)
    expect(controller.getRequest()?.plan.meta.source).toBe('diving-fish')
    controller.getRequest()!.resolve(true)
    expect((await second).applied).toBe(true)
    expect(controller.getRequest()).toBeNull()
  })

  it('imports into a save without an undo store as before', async () => {
    const entries: PlayEntry[] = []
    const cloud = {
      kind: 'cloud',
      entries: () => entries,
      applyImport: async (imported: PlayEntry[]) => {
        entries.push(...imported)
        return { count: imported.length }
      },
    } as unknown as WebScoreRepository
    const { controller, reviewed } = answering(false)
    const result = await reviewAndApplyImport(
      cloud,
      IMPORTED,
      { source: 'lxns', mode: 'replace' },
      {
        trigger: 'manual',
        controller,
      },
    )
    expect(reviewed).toEqual([])
    expect(result.applied).toBe(true)
    expect(entries).toEqual(IMPORTED)
    expect(getImportUndoStore(cloud)).toBeNull()
  })
})

describe('undoLastImport', () => {
  it('puts back the save from before the import, once', async () => {
    const repository = LocalScoreRepository.inMemory(SAVE)
    const { controller } = answering(true)
    await reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'lxns', mode: 'replace' },
      { trigger: 'manual', controller },
    )
    const snapshot = getImportUndoStore(repository)!.get()!
    expect(undoDiscardsLaterChanges(repository, snapshot)).toBe(false)

    expect(undoLastImport(repository)).toBe(true)
    expect(repository.entries()).toEqual(SAVE)
    expect(getImportUndoStore(repository)!.get()).toBeNull()
    expect(undoLastImport(repository)).toBe(false)
  })

  it('tells when the save has changed since the import', async () => {
    const repository = LocalScoreRepository.inMemory(SAVE)
    const { controller } = answering(true)
    await reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'lxns', mode: 'replace' },
      { trigger: 'manual', controller },
    )
    repository.setManual({ sheetId: 'd', achievementRate: 97 }, 'typed')
    expect(undoDiscardsLaterChanges(repository, getImportUndoStore(repository)!.get()!)).toBe(true)
  })

  it('keeps the visitor save undo across a reload', async () => {
    localStorage.clear()
    const repository = new LocalScoreRepository(localStorage)
    await repository.applyImport(SAVE, { source: 'lxns', mode: 'replace' })
    const { controller } = answering(true)
    const result = await reviewAndApplyImport(
      repository,
      IMPORTED,
      { source: 'lxns', mode: 'replace' },
      {
        trigger: 'manual',
        controller,
      },
    )
    expect(result.undoPersisted).toBe(true)

    const reloaded = new LocalScoreRepository(localStorage)
    expect(reloaded.entries()).toEqual(IMPORTED)
    expect(undoLastImport(reloaded)).toBe(true)
    expect(new LocalScoreRepository(localStorage).entries()).toEqual(SAVE)
    localStorage.clear()
  })
})