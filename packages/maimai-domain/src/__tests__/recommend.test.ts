import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { calculateBest50 } from '../best50'
import { recommendRatingRaises } from '../recommend'
import { buildSongCatalog } from '../song-catalog'
import type { RatingEntry } from '../types'

function makeSong(id: string, version: VersionEnum, level: number) {
  return {
    id,
    title: id,
    artist: 'a',
    version,
    category: CategoryEnum.Maimai,
    imageName: id,
    isNew: false,
    isLocked: false,
    searchAcronyms: [],
    sheets: [
      {
        id: `${id}:m`,
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
        level: String(level),
        internalLevelValue: level,
        noteCounts: {},
        serverIds: ['jp' as const],
        isSpecial: false,
        version,
      },
    ],
  }
}

describe('recommendRatingRaises', () => {
  const songs = [
    makeSong('new1', VersionEnum.MAGiCAL, 13),
    makeSong('old1', VersionEnum.PRiSM, 14),
    makeSong('old2', VersionEnum.PRiSM, 12),
  ]
  const catalog = buildSongCatalog({ songs, versions: [] }, VersionEnum.MAGiCAL)
  const entries: RatingEntry[] = [
    { sheetId: 'old1:m', identity: { songId: 'old1', type: 'dx', difficulty: 'master' }, achievementRate: 99 },
  ]
  const best50 = calculateBest50({ catalog, version: VersionEnum.MAGiCAL, region: 'jp', entries })
  const sheets = ['new1:m', 'old1:m', 'old2:m'].map((id) => catalog.getById(id)!)
  const records = new Map(entries.map((e) => [e.sheetId, e]))
  const recs = recommendRatingRaises({ sheets, best50, records, version: VersionEnum.MAGiCAL, region: 'jp' })

  it('suggests unplayed charts at the lowest target when buckets are not full', () => {
    const n = recs.find((r) => r.sheet.id === 'new1:m')!
    expect(n.bucket).toBe('b15')
    expect(n.targetAchievement).toBe(97)
    expect(n.gain).toBe(n.targetRating)
  })
  it('suggests the next step above the current achievement for B50 charts', () => {
    const o = recs.find((r) => r.sheet.id === 'old1:m')!
    expect(o.targetAchievement).toBe(99.5)
    expect(o.gain).toBe(o.targetRating - o.currentRating)
  })
  it('sorts by gain and respects level filters', () => {
    expect(recs.map((r) => r.gain)).toEqual([...recs.map((r) => r.gain)].sort((a, b) => b - a))
    const filtered = recommendRatingRaises({
      sheets,
      best50,
      records,
      version: VersionEnum.MAGiCAL,
      region: 'jp',
      minLevel: 13.5,
    })
    expect(filtered.map((r) => r.sheet.id)).toEqual(['old1:m'])
  })
})
describe('recommendRatingRaises agrees with a B50 recalculation', () => {
  const identity = (id: string) => ({ songId: id, type: 'dx' as const, difficulty: 'master' as const })
  const gainAfter = (
    catalog: ReturnType<typeof buildSongCatalog>,
    region: 'jp' | 'cn',
    entries: RatingEntry[],
    sheetId: string,
    achievementRate: number,
  ) => {
    const version = VersionEnum.MAGiCAL
    const before = calculateBest50({ catalog, version, region, entries }).statistics.b50Sum
    const raised = entries.map((e) => (e.sheetId === sheetId ? { ...e, achievementRate } : e))
    if (!raised.some((e) => e.sheetId === sheetId))
      raised.push({ sheetId, identity: identity(sheetId.split(':')[0]!), achievementRate })
    return calculateBest50({ catalog, version, region, entries: raised }).statistics.b50Sum - before
  }

  it('honours a CN Diving Fish bucket hint for a chart outside a full bucket', () => {
    const cnSong = (id: string, version: VersionEnum, level: number) => {
      const song = makeSong(id, version, level)
      return { ...song, sheets: song.sheets.map((sheet) => ({ ...sheet, serverIds: ['cn' as const] })) }
    }
    const songs = [
      ...Array.from({ length: 15 }, (_, i) => cnSong(`top${i}`, VersionEnum.PRiSM, 14)),
      cnSong('apollo', VersionEnum.BUDDiES, 13),
    ]
    const catalog = buildSongCatalog({ songs, versions: [] }, VersionEnum.MAGiCAL)
    const hint = { provider: 'diving-fish' as const, best50Bucket: 'b15' as const }
    const entries: RatingEntry[] = [
      ...songs
        .slice(0, 15)
        .map((s) => ({ sheetId: `${s.id}:m`, identity: identity(s.id), achievementRate: 100.5, source: hint })),
      { sheetId: 'apollo:m', identity: identity('apollo'), achievementRate: 99, source: hint },
    ]
    const best50 = calculateBest50({ catalog, version: VersionEnum.MAGiCAL, region: 'cn', entries })
    expect(best50.b15).toHaveLength(15)
    const recs = recommendRatingRaises({
      sheets: [catalog.getById('apollo:m')!],
      best50,
      records: new Map(entries.map((e) => [e.sheetId, e])),
      version: VersionEnum.MAGiCAL,
      region: 'cn',
    })
    // Without the hint Apollo would be scored against the empty B35 for a phantom gain
    expect(recs).toEqual([])
    expect(gainAfter(catalog, 'cn', entries, 'apollo:m', 99.5)).toBe(0)
  })

  it('keeps an existing AP bonus in current and target ratings', () => {
    const songs = [makeSong('ap', VersionEnum.PRiSM, 13)]
    const catalog = buildSongCatalog({ songs, versions: [] }, VersionEnum.MAGiCAL)
    const entries: RatingEntry[] = [
      { sheetId: 'ap:m', identity: identity('ap'), achievementRate: 100.1, comboFlag: 'ap' },
    ]
    const best50 = calculateBest50({ catalog, version: VersionEnum.MAGiCAL, region: 'jp', entries })
    const [rec] = recommendRatingRaises({
      sheets: [catalog.getById('ap:m')!],
      best50,
      records: new Map(entries.map((e) => [e.sheetId, e])),
      version: VersionEnum.MAGiCAL,
      region: 'jp',
    })
    expect(rec!.currentRating).toBe(best50.b35[0]!.rating.ratingAwardValue)
    expect(rec!.gain).toBe(gainAfter(catalog, 'jp', entries, 'ap:m', rec!.targetAchievement))
  })

  it('does not assume an AP bonus near a full bucket cutoff', () => {
    const songs = [
      ...Array.from({ length: 35 }, (_, i) => makeSong(`f${i}`, VersionEnum.PRiSM, 13)),
      makeSong('cand', VersionEnum.PRiSM, 13),
    ]
    const catalog = buildSongCatalog({ songs, versions: [] }, VersionEnum.MAGiCAL)
    const entries: RatingEntry[] = [
      ...songs.slice(0, 35).map((s) => ({ sheetId: `${s.id}:m`, identity: identity(s.id), achievementRate: 100.5 })),
      { sheetId: 'cand:m', identity: identity('cand'), achievementRate: 99, comboFlag: 'fc' },
    ]
    const best50 = calculateBest50({ catalog, version: VersionEnum.MAGiCAL, region: 'jp', entries })
    const recs = recommendRatingRaises({
      sheets: [catalog.getById('cand:m')!],
      best50,
      records: new Map(entries.map((e) => [e.sheetId, e])),
      version: VersionEnum.MAGiCAL,
      region: 'jp',
    })
    // 100.5 FC ties the floor exactly: no gain, as a recalculation confirms
    expect(recs).toEqual([])
    expect(gainAfter(catalog, 'jp', entries, 'cand:m', 100.5)).toBe(0)
  })
})