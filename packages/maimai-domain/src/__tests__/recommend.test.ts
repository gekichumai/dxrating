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