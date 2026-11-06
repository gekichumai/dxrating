import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { buildSongCatalog } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { computeSongHubRaises } from '../songHubRaise'

const sheet = (id: string, difficulty: DifficultyEnum, level: number) => ({
  id: `${id}:${difficulty}`,
  type: TypeEnum.DX,
  difficulty,
  level: String(level),
  internalLevelValue: level,
  noteCounts: {},
  serverIds: ['jp' as const],
  isSpecial: false,
  version: VersionEnum.PRiSM,
})

const songs = [
  {
    id: 'song',
    title: 'song',
    artist: 'a',
    version: VersionEnum.PRiSM,
    category: CategoryEnum.Maimai,
    imageName: 'song',
    isNew: false,
    isLocked: false,
    searchAcronyms: [],
    sheets: [sheet('song', DifficultyEnum.Expert, 12), sheet('song', DifficultyEnum.Master, 14)],
  },
]

describe('computeSongHubRaises', () => {
  const catalog = buildSongCatalog({ songs, versions: [] }, VersionEnum.MAGiCAL)
  const songSheets = ['song:expert', 'song:master'].map((id) => catalog.getById(id)!)

  it('gives each chart its lowest raising step', () => {
    const raises = computeSongHubRaises({
      songSheets,
      entries: [{ sheetId: 'song:master', achievementRate: 99 }],
      catalog,
      version: VersionEnum.MAGiCAL,
      region: 'jp',
    })
    expect(raises.get('song:master')?.targetAchievement).toBe(99.5)
    expect(raises.get('song:expert')?.targetAchievement).toBe(97)
    expect(raises.get('song:expert')?.gain).toBeGreaterThan(0)
  })

  it('suggests nothing above an SSS+ record', () => {
    const raises = computeSongHubRaises({
      songSheets,
      entries: [{ sheetId: 'song:master', achievementRate: 100.5 }],
      catalog,
      version: VersionEnum.MAGiCAL,
      region: 'jp',
    })
    expect(raises.has('song:master')).toBe(false)
  })
})
