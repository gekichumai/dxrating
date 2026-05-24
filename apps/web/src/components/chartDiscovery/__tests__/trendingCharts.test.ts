import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type Sheet, type Song } from '@gekichumai/dxdata'
import { formatSheetIdentity } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { buildTrendingChartLinks } from '../trendingCharts'

const makeSong = (
  songId: string,
  sheets: Song['sheets'],
  overrides: Partial<Omit<Song, 'sheets' | 'songId'>> = {},
): Song => ({
  songId,
  title: songId,
  artist: `${songId} artist`,
  category: CategoryEnum.Maimai,
  imageName: songId,
  searchAcronyms: [],
  bpm: 120,
  isNew: false,
  isLocked: false,
  sheets,
  ...overrides,
})

const makeSheet = (id: string, overrides: Partial<Sheet> = {}): Sheet => ({
  internalId: Number(id),
  type: TypeEnum.DX,
  difficulty: DifficultyEnum.Master,
  level: '13+',
  internalLevelValue: 13.7,
  version: VersionEnum.CiRCLEPLUS,
  noteCounts: {
    tap: null,
    hold: null,
    slide: null,
    touch: null,
    break: null,
    total: null,
  },
  noteDesigner: '',
  regions: {
    jp: true,
    intl: true,
    cn: true,
  },
  isSpecial: false,
  ...overrides,
})

describe('buildTrendingChartLinks', () => {
  it('does not read song data when trending results are empty', () => {
    const unreadableSongs = {
      [Symbol.iterator]: () => {
        throw new Error('songs should not be read')
      },
    } as unknown as readonly Song[]

    expect(buildTrendingChartLinks([], unreadableSongs)).toEqual([])
  })

  it('maps trending song results to representative charts in API order', () => {
    const links = buildTrendingChartLinks(
      [{ songId: 'second' }, { songId: 'popular' }, { songId: 'missing' }],
      [
        makeSong('popular', [
          makeSheet('1', { difficulty: DifficultyEnum.Expert, internalLevelValue: 12.9 }),
          makeSheet('2', { difficulty: DifficultyEnum.Master, internalLevelValue: 14.1 }),
        ]),
        makeSong('second', [makeSheet('3', { internalLevelValue: 13.5 })]),
      ],
    )

    expect(links.map((link) => link.songId)).toEqual(['second', 'popular'])
    expect(links.map((link) => link.href)).toEqual(['/songs/second/dx/master', '/songs/popular/dx/master'])
    expect(links[0]).toMatchObject({
      id: formatSheetIdentity({
        songId: 'second',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
      identity: {
        songId: 'second',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      },
      isTypeUtage: false,
      isRatingEligible: true,
      tags: [],
      releaseDateTimestamp: 0,
    })
  })

  it('prefers rating-eligible charts over higher-level utage charts for song-level results', () => {
    const links = buildTrendingChartLinks(
      [{ songId: 'song' }],
      [
        makeSong('song', [
          makeSheet('1', {
            type: TypeEnum.UTAGE,
            difficulty: DifficultyEnum.Master,
            internalLevelValue: 15,
          }),
          makeSheet('2', {
            type: TypeEnum.DX,
            difficulty: DifficultyEnum.Master,
            internalLevelValue: 14.2,
          }),
        ]),
      ],
    )

    expect(links).toHaveLength(1)
    expect(links[0]?.type).toBe(TypeEnum.DX)
    expect(links[0]?.internalLevelValue).toBe(14.2)
  })

  it('uses an exact chart when the trending result includes type and difficulty', () => {
    const links = buildTrendingChartLinks(
      [{ songId: 'song', sheetType: TypeEnum.STD, sheetDifficulty: DifficultyEnum.Expert }],
      [
        makeSong('song', [
          makeSheet('1', {
            type: TypeEnum.DX,
            difficulty: DifficultyEnum.Master,
            internalLevelValue: 14.2,
          }),
          makeSheet('2', {
            type: TypeEnum.STD,
            difficulty: DifficultyEnum.Expert,
            internalLevelValue: 12.8,
          }),
        ]),
      ],
    )

    expect(links).toHaveLength(1)
    expect(links[0]?.type).toBe(TypeEnum.STD)
    expect(links[0]?.difficulty).toBe(DifficultyEnum.Expert)
  })
})