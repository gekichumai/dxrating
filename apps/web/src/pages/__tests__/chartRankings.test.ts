import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import type { FlattenedSheet } from '../../songs'
import { selectRecentlyUpdatedSheets, selectTrendingSheets } from '../chartRankings'

const makeSheet = (
  id: string,
  overrides: Partial<FlattenedSheet> & Pick<FlattenedSheet, 'songId' | 'internalLevelValue'>,
): FlattenedSheet =>
  ({
    id,
    title: overrides.songId,
    artist: '',
    category: '',
    imageName: id,
    type: TypeEnum.DX,
    difficulty: DifficultyEnum.Master,
    version: 'maimai でらっくす',
    releaseDateTimestamp: 0,
    tags: [],
    searchAcronyms: [],
    isTypeUtage: false,
    isRatingEligible: true,
    level: String(Math.floor(overrides.internalLevelValue)),
    regions: {},
    noteCounts: {},
    ...overrides,
  }) as FlattenedSheet

describe('chart ranking selectors', () => {
  it('orders recent charts by newest release timestamp first', () => {
    const oldest = makeSheet('oldest', { songId: 'oldest', internalLevelValue: 12.3, releaseDateTimestamp: 100 })
    const newest = makeSheet('newest', { songId: 'newest', internalLevelValue: 13.7, releaseDateTimestamp: 300 })
    const middle = makeSheet('middle', { songId: 'middle', internalLevelValue: 11.8, releaseDateTimestamp: 200 })

    expect(selectRecentlyUpdatedSheets([oldest, newest, middle]).map((sheet) => sheet.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ])
  })

  it('maps trending song results to representative charts in API order', () => {
    const popularExpert = makeSheet('popular-expert', {
      songId: 'popular',
      internalLevelValue: 12.9,
      difficulty: DifficultyEnum.Expert,
    })
    const popularMaster = makeSheet('popular-master', {
      songId: 'popular',
      internalLevelValue: 14.1,
      difficulty: DifficultyEnum.Master,
    })
    const secondMaster = makeSheet('second-master', {
      songId: 'second',
      internalLevelValue: 13.5,
      difficulty: DifficultyEnum.Master,
    })

    expect(
      selectTrendingSheets({
        results: [{ songId: 'second' }, { songId: 'popular' }, { songId: 'missing' }],
        sheets: [popularExpert, popularMaster, secondMaster],
      }).map((sheet) => sheet.id),
    ).toEqual(['second-master', 'popular-master'])
  })

  it('prefers rating-eligible charts over higher-level utage charts for song-level trending results', () => {
    const standard = makeSheet('standard', {
      songId: 'song',
      internalLevelValue: 14.2,
      isRatingEligible: true,
      isTypeUtage: false,
    })
    const utage = makeSheet('utage', {
      songId: 'song',
      internalLevelValue: 15.0,
      type: TypeEnum.UTAGE,
      difficulty: DifficultyEnum.Master,
      isRatingEligible: false,
      isTypeUtage: true,
    })

    expect(
      selectTrendingSheets({ results: [{ songId: 'song' }], sheets: [utage, standard] }).map((sheet) => sheet.id),
    ).toEqual(['standard'])
  })
})