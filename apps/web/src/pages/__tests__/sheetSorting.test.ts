import { DifficultyEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import type { SortPredicate } from '../../components/sheet/SheetSortFilter'
import type { FlattenedSheet } from '../../songs'
import { compareSheetsBySorts } from '../sheetSorting'

const releaseDateDescending: SortPredicate[] = [{ descriptor: 'releaseDate', direction: 'desc' }]

const sheet = (
  songId: string,
  releaseDateTimestamp: number,
  internalLevelValue = 12,
  difficulty = DifficultyEnum.Basic,
) =>
  ({
    songId,
    releaseDateTimestamp,
    internalLevelValue,
    difficulty,
  }) as FlattenedSheet

const catalogPositions = new Map([
  ['earlier-added', 10],
  ['later-added', 11],
])

describe('compareSheetsBySorts', () => {
  it('puts later-added songs first when descending release dates tie', () => {
    const earlierAdded = sheet('earlier-added', 100)
    const laterAdded = sheet('later-added', 100)

    expect(compareSheetsBySorts(laterAdded, earlierAdded, releaseDateDescending, catalogPositions)).toBeLessThan(0)
    expect(compareSheetsBySorts(earlierAdded, laterAdded, releaseDateDescending, catalogPositions)).toBeGreaterThan(0)
  })

  it('orders the reported same-day catalog batch with the latest song first', () => {
    const batch = ['Broomstick adventure!', '無彩色のディストピア', 'Manifold Hypothesis', 'Inverted World'].map(
      (songId) => sheet(songId, Date.parse('2026-08-21')),
    )

    expect(batch.sort((a, b) => compareSheetsBySorts(a, b, releaseDateDescending)).map(({ songId }) => songId)).toEqual(
      ['Inverted World', 'Manifold Hypothesis', '無彩色のディストピア', 'Broomstick adventure!'],
    )
  })

  it('follows ascending release-date direction for the catalog tie-break', () => {
    const sorts: SortPredicate[] = [{ descriptor: 'releaseDate', direction: 'asc' }]
    const earlierAdded = sheet('earlier-added', 100)
    const laterAdded = sheet('later-added', 100)

    expect(compareSheetsBySorts(earlierAdded, laterAdded, sorts, catalogPositions)).toBeLessThan(0)
  })

  it('preserves sheet order within the same song', () => {
    const basic = sheet('later-added', 100, 3, DifficultyEnum.Basic)
    const master = sheet('later-added', 100, 13, DifficultyEnum.Master)

    expect(compareSheetsBySorts(basic, master, releaseDateDescending, catalogPositions)).toBe(0)
  })

  it('keeps release date ahead of the catalog tie-break', () => {
    const newerEarlierAdded = sheet('earlier-added', 200)
    const olderLaterAdded = sheet('later-added', 100)

    expect(
      compareSheetsBySorts(newerEarlierAdded, olderLaterAdded, releaseDateDescending, catalogPositions),
    ).toBeLessThan(0)
  })

  it('keeps explicit secondary predicates ahead of the catalog tie-break', () => {
    const sorts: SortPredicate[] = [...releaseDateDescending, { descriptor: 'internalLevelValue', direction: 'asc' }]
    const lowerEarlierAdded = sheet('earlier-added', 100, 11)
    const higherLaterAdded = sheet('later-added', 100, 14)

    expect(compareSheetsBySorts(lowerEarlierAdded, higherLaterAdded, sorts, catalogPositions)).toBeLessThan(0)
  })

  it('leaves unknown catalog positions stable', () => {
    const first = sheet('unknown-one', 100)
    const second = sheet('unknown-two', 100)

    expect(compareSheetsBySorts(first, second, releaseDateDescending, catalogPositions)).toBe(0)
  })

  it('sorts unknown catalog positions after known songs', () => {
    const known = sheet('later-added', 100)
    const unknown = sheet('unknown', 100)

    expect(compareSheetsBySorts(known, unknown, releaseDateDescending, catalogPositions)).toBeLessThan(0)
    expect(compareSheetsBySorts(unknown, known, releaseDateDescending, catalogPositions)).toBeGreaterThan(0)
  })
})