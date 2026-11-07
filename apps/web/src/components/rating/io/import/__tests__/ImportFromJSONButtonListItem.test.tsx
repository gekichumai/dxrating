import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalScoreRepository } from '@/models/scores/LocalScoreRepository'
import { ScoreRepositoryContext } from '@/models/scores/useScoreRepository'
import { ImportFromJSONButtonListItem } from '../ImportFromJSONButtonListItem'
import { importReviewController } from '@/models/scores/importReview'
import { ImportReviewHost } from '../ImportReviewDialog'

const { toast, toastError, toastSuccess } = vi.hoisted(() => {
  const toastError = vi.fn()
  const toastSuccess = vi.fn()
  return { toastError, toastSuccess, toast: Object.assign(vi.fn(), { error: toastError, success: toastSuccess }) }
})

vi.mock('react-hot-toast', () => ({ default: toast }))

vi.mock('web-haptics/react', () => ({
  useWebHaptics: () => ({ trigger: vi.fn() }),
}))

const SAVED = [{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 }]

/** Opens the menu item's file picker and picks a file with `content` */
async function importFile(content: string) {
  const createElement = document.createElement.bind(document)
  let input: HTMLInputElement | undefined
  const spy = vi
    .spyOn(document, 'createElement')
    .mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = createElement(tagName, options)
      if (tagName === 'input') {
        input = element as HTMLInputElement
        input.click = () => {}
      }
      return element
    })
  fireEvent.click(screen.getByRole('menuitem'))
  spy.mockRestore()

  const file = new File([content], 'dxrating.export.json', { type: 'application/json' })
  Object.defineProperty(input!, 'files', { value: [file] })
  input!.onchange?.({ target: input } as unknown as Event)
}

describe('ImportFromJSONButtonListItem', () => {
  let repository: LocalScoreRepository

  afterEach(() => {
    // A preview a failed test left open
    importReviewController.getRequest()?.resolve(false)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.localStorage.setItem('rating-calculator-entries', JSON.stringify(SAVED))
    repository = new LocalScoreRepository(window.localStorage)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ScoreRepositoryContext.Provider value={repository}>{children}</ScoreRepositoryContext.Provider>
    )
    render(
      <>
        <ImportFromJSONButtonListItem onClose={() => {}} />
        <ImportReviewHost />
      </>,
      { wrapper },
    )
  })

  it('replaces the save with a valid rating file once the visitor confirms the preview', async () => {
    const entries = [{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5, comboFlag: 'ap', dxScore: 2000 }]
    await importFile(JSON.stringify(entries))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Review import from DXRating file')
    expect(dialog.textContent).toContain('1 chart would get a lower score or be removed')
    fireEvent.click(screen.getByRole('button', { name: 'Import anyway' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Imported 1 record'))
    expect(repository.entries()).toEqual(entries)
    expect(window.localStorage.getItem('rating-calculator-entries')).toBe(JSON.stringify(entries))
    expect(JSON.parse(window.localStorage.getItem('rating-calculator-import-undo')!).previousEntries).toEqual(SAVED)
  })

  it('keeps the save when the visitor cancels the preview', async () => {
    await importFile(JSON.stringify([{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5 }]))

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Import cancelled. Your saved scores are unchanged.', expect.anything()),
    )
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(repository.entries()).toEqual(SAVED)
    expect(window.localStorage.getItem('rating-calculator-import-undo')).toBeNull()
  })

  it('imports an "all records" export of a save with entries of every kind back as it was', async () => {
    // What the "all records" export writes: the saved entries as they are
    const saved = [
      { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 },
      {
        sheetId: 'dsht_e5nsvt8k2a',
        identity: { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' },
        achievementRate: 100.5432,
        comboFlag: 'ap',
        syncFlag: 'fsd',
        source: { provider: 'maimai-net', providerSongName: '君の知らない物語' },
      },
      {
        sheetId: 'dsht_mpd82wyms9',
        achievementRate: 97.12345,
        comboFlag: null,
        syncFlag: null,
        dxScore: 1234,
        source: { provider: 'diving-fish', providerId: 11451, providerSongName: 'Link', best50Bucket: 'b35' },
        providerConfig: { divingFish: { ratingEligibility: 'b35' } },
      },
      {
        sheetId: '君の知らない物語__dxrt__std__dxrt__expert',
        identity: { songId: '君の知らない物語', type: 'std', difficulty: 'expert' },
        achievementRate: 98,
      },
      { sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 97 },
      // typed into earlier add forms: out of range, and an empty field (`NaN`, written as `null`)
      { sheetId: 'dsht_23456789ab', achievementRate: 101.5 },
      { sheetId: 'dsht_3456789abc', achievementRate: Number.NaN },
    ]
    const exported = JSON.stringify(saved)
    repository.clear()

    await importFile(exported)
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Imported 7 records'))
    expect(toastError).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem('rating-calculator-entries')!)).toEqual(JSON.parse(exported))
  })

  it('tells the visitor a file is not a rating file and keeps the save', async () => {
    await importFile(JSON.stringify({ userMusicDetailList: [] }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("This file isn't a DXRating rating export. Nothing was imported."),
    )
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(repository.entries()).toEqual(SAVED)
    expect(window.localStorage.getItem('rating-calculator-entries')).toBe(JSON.stringify(SAVED))
  })

  it('reports a file that is not JSON as before, keeping the save', async () => {
    await importFile('not json')

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastError.mock.calls[0]![0]).toMatch(/^Unable to import this file\. /)
    expect(repository.entries()).toEqual(SAVED)
  })
})