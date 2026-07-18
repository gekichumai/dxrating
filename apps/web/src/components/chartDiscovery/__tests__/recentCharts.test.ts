import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type Sheet, type Song } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { RECENT_CHART_LIMIT, buildRecentChartLinks } from '../recentCharts'

const createSheet = (releaseDate: string, difficulty = DifficultyEnum.Master): Sheet => ({
  type: TypeEnum.DX,
  difficulty,
  level: '13',
  internalLevelValue: 13,
  releaseDate,
  noteDesigner: null,
  noteCounts: {
    tap: null,
    hold: null,
    slide: null,
    touch: null,
    break: null,
    total: null,
  },
  regions: {
    jp: true,
    intl: true,
    cn: true,
  },
  isSpecial: false,
  version: VersionEnum.CiRCLEPLUS,
})

const createSong = (index: number, releaseDate = `2026-05-${String((index % 28) + 1).padStart(2, '0')}`): Song => ({
  songId: `song-${index}`,
  title: `Song ${index}`,
  artist: `Artist ${index}`,
  category: CategoryEnum.Maimai,
  bpm: 120,
  imageName: '',
  isNew: false,
  isLocked: false,
  searchAcronyms: [],
  sheets: [createSheet(releaseDate)],
})

describe('buildRecentChartLinks', () => {
  it('sorts charts by release date descending and caps at 500', () => {
    const charts = buildRecentChartLinks(
      Array.from({ length: 501 }, (_, index) =>
        createSong(index, new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)),
      ),
    )

    expect(charts).toHaveLength(RECENT_CHART_LIMIT)
    expect(charts.every((chart) => chart.difficulty !== DifficultyEnum.Basic)).toBe(true)
    expect(charts.every((chart) => chart.difficulty !== DifficultyEnum.Advanced)).toBe(true)
    expect(charts[0]).toMatchObject({
      songId: 'song-500',
      title: 'Song 500',
      artist: 'Artist 500',
      releaseDate: '2027-05-16',
      href: '/songs/song-500/dx/master',
    })
    expect(charts.every((chart) => chart.href.startsWith('/songs/'))).toBe(true)
  })

  it('returns a copy of the cached default recent chart list', () => {
    const first = buildRecentChartLinks()
    const firstChart = first[0]
    first.length = 0

    const second = buildRecentChartLinks()

    expect(second).toHaveLength(RECENT_CHART_LIMIT)
    expect(second[0]).toEqual(firstChart)
  })

  it('excludes basic and advanced charts from the recent chart candidates', () => {
    const charts = buildRecentChartLinks([
      {
        ...createSong(1),
        sheets: [
          createSheet('2026-05-01', DifficultyEnum.Basic),
          createSheet('2026-05-01', DifficultyEnum.Advanced),
          createSheet('2026-05-01', DifficultyEnum.Expert),
          createSheet('2026-05-01', DifficultyEnum.Master),
        ],
      },
    ])

    expect(charts.map((chart) => chart.difficulty)).toEqual([DifficultyEnum.Expert, DifficultyEnum.Master])
  })

  it('uses stable tie-breakers when release dates match', () => {
    const charts = buildRecentChartLinks([
      createSong(2, '2026-05-01'),
      createSong(1, '2026-05-01'),
      {
        ...createSong(0, '2026-05-01'),
        sheets: [
          { ...createSheet('2026-05-01'), type: TypeEnum.STD },
          { ...createSheet('2026-05-01'), type: TypeEnum.DX },
        ],
      },
    ])

    expect(charts.map((chart) => `${chart.title}:${chart.type}:${chart.difficulty}`)).toEqual([
      'Song 0:dx:master',
      'Song 0:std:master',
      'Song 1:dx:master',
      'Song 2:dx:master',
    ])
  })

  it('sorts undated sheets as the newest in their version (NEW -> OLD)', () => {
    const undatedSheet: Sheet = {
      ...createSheet('2026-01-01'),
      releaseDate: undefined,
      version: VersionEnum.CiRCLE,
    }
    const charts = buildRecentChartLinks([
      {
        ...createSong(1, '2026-03-05'),
        songId: 'dated-latest',
        title: 'Dated Latest',
        sheets: [{ ...createSheet('2026-03-05'), version: VersionEnum.CiRCLE }],
      },
      {
        ...createSong(2, '2025-09-18'),
        songId: 'dated-older',
        title: 'Dated Older',
        sheets: [{ ...createSheet('2025-09-18'), version: VersionEnum.CiRCLE }],
      },
      {
        ...createSong(0),
        songId: 'Bring it on',
        title: 'Bring it on',
        sheets: [undatedSheet],
      },
    ])

    // Same timestamp as the newest known chart in CiRCLE; title tie-break is fine.
    expect(charts.map((chart) => chart.songId)).toEqual(['Bring it on', 'dated-latest', 'dated-older'])
    const undated = charts.find((chart) => chart.songId === 'Bring it on')
    const latest = charts.find((chart) => chart.songId === 'dated-latest')
    expect(undated?.releaseDate).toBeUndefined()
    expect(undated?.releaseDateTimestamp).toBe(latest?.releaseDateTimestamp)
    expect((undated?.releaseDateTimestamp ?? 0) > (charts[2]?.releaseDateTimestamp ?? 0)).toBe(true)
  })
})