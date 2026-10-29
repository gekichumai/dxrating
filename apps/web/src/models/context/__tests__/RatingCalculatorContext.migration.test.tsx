import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { useSheetFavoriteState } from '../../favorite'
import { RatingCalculatorContextProvider, useRatingCalculatorContext } from '../RatingCalculatorContext'

// Saved data from before public sheet IDs, as real browsers hold it, against the bundled catalog snapshot

const LEGACY_ENTRIES: PlayEntry[] = [
  {
    sheetId: '君の知らない物語__dxrt__dx__dxrt__master',
    identity: { songId: '君の知らない物語', type: 'dx', difficulty: 'master' },
    achievementRate: 100.5,
    comboFlag: 'ap',
  },
  // the second of two songs titled "Link"
  { sheetId: 'Link (2)__dxrt__std__dxrt__basic', achievementRate: 99.1 },
  // a song no catalog has: kept as it is
  { sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 97 },
]

const MIGRATED_ENTRIES = [
  {
    sheetId: 'dsht_e5nsvt8k2a',
    identity: { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' },
    achievementRate: 100.5,
    comboFlag: 'ap',
  },
  { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 },
  { sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 97 },
]

const renderContext = () => renderHook(() => useRatingCalculatorContext(), { wrapper: RatingCalculatorContextProvider })

describe('RatingCalculatorContext saved data migration', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('moves saved entries to public sheet IDs, keeping a backup and the entries it cannot match', async () => {
    const saved = JSON.stringify(LEGACY_ENTRIES)
    window.localStorage.setItem('rating-calculator-entries', saved)

    const { result } = renderContext()

    await waitFor(() => expect(result.current.entries).toEqual(MIGRATED_ENTRIES))
    expect(JSON.parse(window.localStorage.getItem('rating-calculator-entries')!)).toEqual(MIGRATED_ENTRIES)
    expect(window.localStorage.getItem('rating-calculator-entries.legacy-backup')).toBe(saved)
  })

  it('migrates a rating file with legacy sheet IDs when it is imported', async () => {
    const { result } = renderContext()

    act(() => {
      result.current.modifyEntries.set(LEGACY_ENTRIES)
    })

    await waitFor(() => expect(result.current.entries).toEqual(MIGRATED_ENTRIES))
  })

  it('leaves entries with public sheet IDs and the first backup alone', async () => {
    window.localStorage.setItem('rating-calculator-entries', JSON.stringify(MIGRATED_ENTRIES))
    window.localStorage.setItem('rating-calculator-entries.legacy-backup', 'first backup')

    const { result } = renderContext()
    // let a migration pass run, if one were to
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(result.current.entries).toEqual(MIGRATED_ENTRIES)
    expect(window.localStorage.getItem('rating-calculator-entries.legacy-backup')).toBe('first backup')
  })

  it('moves saved favorites to public sheet IDs, keeping a backup', async () => {
    const saved = JSON.stringify([
      'Link__dxrt__std__dxrt__basic',
      'dsht_e5nsvt8k2a',
      'retired song__dxrt__dx__dxrt__master',
    ])
    window.localStorage.setItem('favorite-sheets', saved)

    renderContext()

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('favorite-sheets')!)).toEqual([
        'dsht_mpd82wyms9',
        'dsht_e5nsvt8k2a',
        'retired song__dxrt__dx__dxrt__master',
      ]),
    )
    expect(window.localStorage.getItem('favorite-sheets.legacy-backup')).toBe(saved)
  })

  it('updates mounted favorite controls, so a later toggle keeps the migrated favorites', async () => {
    window.localStorage.setItem(
      'favorite-sheets',
      JSON.stringify(['Link__dxrt__std__dxrt__basic', 'Link (2)__dxrt__std__dxrt__basic']),
    )
    const FavoriteStar = ({ sheetId }: { sheetId: string }) => {
      const [favored, toggle] = useSheetFavoriteState(sheetId)
      return (
        <button type="button" onClick={toggle}>
          {sheetId}:{favored ? 'favored' : 'not favored'}
        </button>
      )
    }

    render(
      <RatingCalculatorContextProvider>
        <FavoriteStar sheetId="dsht_mpd82wyms9" />
      </RatingCalculatorContextProvider>,
    )

    // "Link" basic, favored under its legacy ID before the migration
    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('dsht_mpd82wyms9:favored'))
    act(() => {
      screen.getByRole('button').click()
    })

    expect(screen.getByRole('button').textContent).toBe('dsht_mpd82wyms9:not favored')
    expect(JSON.parse(window.localStorage.getItem('favorite-sheets')!)).toEqual(['dsht_5mk3yr8gme'])
  })
})