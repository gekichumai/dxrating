import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { ImportReviewController, reviewAndApplyImport } from '@/models/scores/importReview'
import { IMPORT_UNDO_STORAGE_KEY } from '@/models/scores/importUndo'
import { LocalScoreRepository } from '@/models/scores/LocalScoreRepository'
import { ScoreRepositoryContext } from '@/models/scores/useScoreRepository'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { ImportUndoBanner } from '../ImportUndoBanner'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { error: toastError, success: toastSuccess } }))

const SAVE: PlayEntry[] = [
  { sheetId: 'a', achievementRate: 100.5 },
  { sheetId: 'b', achievementRate: 99 },
]
const IMPORTED: PlayEntry[] = [{ sheetId: 'a', achievementRate: 100.6 }]

const confirmAll = () => {
  const controller = new ImportReviewController()
  controller.subscribe(() => controller.getRequest()?.resolve(true))
  return controller
}

describe('ImportUndoBanner', () => {
  let repository: LocalScoreRepository

  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('rating-calculator-entries', JSON.stringify(SAVE))
    repository = new LocalScoreRepository(localStorage)
  })

  afterEach(() => {
    localStorage.clear()
  })

  const renderBanner = () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ScoreRepositoryContext.Provider value={repository}>{children}</ScoreRepositoryContext.Provider>
    )
    return render(<ImportUndoBanner />, { wrapper })
  }

  const importNow = () =>
    act(async () => {
      await reviewAndApplyImport(
        repository,
        IMPORTED,
        { source: 'lxns', mode: 'replace' },
        {
          trigger: 'manual',
          controller: confirmAll(),
        },
      )
    })

  it('shows nothing without an import to undo', () => {
    renderBanner()
    expect(screen.queryByRole('button', { name: 'Undo import' })).toBeNull()
  })

  it('appears after an import and restores the save from before it', async () => {
    renderBanner()
    await importNow()
    expect(screen.getByText(/Imported 1 record from LXNS on/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }))
    expect(screen.getByText('Your 2 records from before the LXNS import will be restored.')).toBeTruthy()
    expect(screen.queryByText(/Those changes will be lost too/)).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo import' }).at(-1)!)

    expect(toastSuccess).toHaveBeenCalledWith('Import undone. Your earlier scores are back.')
    expect(repository.entries()).toEqual(SAVE)
    expect(JSON.parse(localStorage.getItem('rating-calculator-entries')!)).toEqual(SAVE)
    expect(localStorage.getItem(IMPORT_UNDO_STORAGE_KEY)).toBeNull()
    expect(screen.queryByText(/Imported 1 record/)).toBeNull()
  })

  it('is still offered after a reload', async () => {
    await importNow()
    repository = new LocalScoreRepository(localStorage)
    renderBanner()
    expect(screen.getByRole('button', { name: 'Undo import' })).toBeTruthy()
  })

  it('warns that changes made after the import are lost too', async () => {
    renderBanner()
    await importNow()
    act(() => repository.setManual({ sheetId: 'c', achievementRate: 97 }, 'typed'))

    fireEvent.click(screen.getByRole('button', { name: 'Undo import' }))
    expect(screen.getByText('You changed scores after the import. Those changes will be lost too.')).toBeTruthy()
  })

  it('can be hidden without undoing', async () => {
    renderBanner()
    await importNow()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('button', { name: 'Undo import' })).toBeNull()
    expect(repository.entries()).toEqual(IMPORTED)
  })
})