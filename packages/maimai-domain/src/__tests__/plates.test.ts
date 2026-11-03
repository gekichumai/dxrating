import { CategoryEnum, DifficultyEnum, type Sheet, type Song, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import {
  buildPlateCharts,
  evaluatePlate,
  findPlate,
  getPlateVersionGroups,
  listPlates,
  meetsPlateCondition,
  type PlateKind,
  type PlateRecord,
  plateName,
} from '../plates'

const BASE = [DifficultyEnum.Basic, DifficultyEnum.Advanced, DifficultyEnum.Expert, DifficultyEnum.Master]

function sheet(
  songId: string,
  type: TypeEnum,
  difficulty: DifficultyEnum,
  version: VersionEnum,
  extra: Partial<Sheet> = {},
): Sheet {
  return {
    id: `${songId}:${type}:${difficulty}`,
    type,
    difficulty,
    level: '10',
    internalLevelValue: 10,
    noteCounts: {},
    serverIds: ['jp', 'intl', 'usa', 'cn'],
    isSpecial: false,
    version,
    ...extra,
  }
}

function song(id: string, sheets: Sheet[]): Song {
  return {
    id,
    title: id,
    artist: 'a',
    category: CategoryEnum.Maimai,
    imageName: id,
    version: sheets[0]!.version,
    isNew: false,
    isLocked: false,
    searchAcronyms: [],
    sheets,
  }
}

const base = (songId: string, type: TypeEnum, version: VersionEnum) => BASE.map((d) => sheet(songId, type, d, version))

const songs: Song[] = [
  // SD song with an SD-era Re:MASTER and a later DX chart set
  song('old', [
    ...base('old', TypeEnum.STD, VersionEnum.FiNALE),
    sheet('old', TypeEnum.STD, DifficultyEnum.ReMaster, VersionEnum.FiNALE),
    ...base('old', TypeEnum.DX, VersionEnum.PRiSM),
  ]),
  // SD song whose Re:MASTER was added in the DX era
  song('late-re', [
    ...base('late-re', TypeEnum.STD, VersionEnum.MiLK),
    sheet('late-re', TypeEnum.STD, DifficultyEnum.ReMaster, VersionEnum.Splash),
  ]),
  song('kuma', base('kuma', TypeEnum.DX, VersionEnum.Maimaiでらっくす)),
  song('hana', base('hana', TypeEnum.DX, VersionEnum.MaimaiでらっくすPLUS)),
  song(
    'cn-gone',
    base('cn-gone', TypeEnum.DX, VersionEnum.PRiSM).map((s) => ({ ...s, serverIds: ['jp'] as Sheet['serverIds'] })),
  ),
  song('utage', [sheet('utage', TypeEnum.UTAGE, DifficultyEnum.Basic, VersionEnum.PRiSM)]),
]

describe('meetsPlateCondition', () => {
  const cases: [PlateKind, PlateRecord | undefined, boolean][] = [
    ['hasha', { achievementRate: 80 }, true],
    ['hasha', { achievementRate: 79.9999 }, false],
    ['hasha', undefined, false],
    ['kiwami', { achievementRate: 50, comboFlag: 'fc' }, true],
    ['kiwami', { achievementRate: 50, comboFlag: 'app' }, true],
    ['kiwami', { achievementRate: 101, comboFlag: null }, false],
    ['sho', { achievementRate: 100 }, true],
    ['sho', { achievementRate: 99.9999, comboFlag: 'app' }, false],
    ['shin', { achievementRate: 90, comboFlag: 'ap' }, true],
    ['shin', { achievementRate: 101, comboFlag: 'fcp' }, false],
    ['maimai', { achievementRate: 90, syncFlag: 'fsd' }, true],
    ['maimai', { achievementRate: 90, syncFlag: 'fsdp' }, true],
    ['maimai', { achievementRate: 101, syncFlag: 'fsp' }, false],
  ]
  it.each(cases)('%s with %o → %s', (kind, record, expected) => {
    expect(meetsPlateCondition(kind, record)).toBe(expected)
  })
})

describe('plate lists', () => {
  it('has no 真将 and only 覇者', () => {
    const ids = listPlates('jp').map((p) => p.id)
    expect(ids).not.toContain('shin-ver-sho')
    expect(ids).toContain('shin-ver-kiwami')
    expect(ids.filter((id) => id.startsWith('ha-'))).toEqual(['ha-hasha'])
  })
  it('names plates', () => {
    expect(plateName(findPlate('jp', 'ha-hasha')!)).toBe('覇者')
    expect(plateName(findPlate('cn', 'ha-hasha')!, 'zh')).toBe('霸者')
    expect(plateName(findPlate('jp', 'kagami-shin')!)).toBe('鏡神')
    expect(plateName(findPlate('cn', 'akatsuki-kiwami')!, 'zh')).toBe('晓极')
  })
  it('splits 熊 / 華 on JP and merges them on CN', () => {
    const jp = getPlateVersionGroups('jp')
    const cn = getPlateVersionGroups('cn')
    expect(jp.find((g) => g.id === 'kuma')!.versions).toEqual([VersionEnum.Maimaiでらっくす])
    expect(cn.find((g) => g.id === 'hana')!.versions).toEqual([
      VersionEnum.Maimaiでらっくす,
      VersionEnum.MaimaiでらっくすPLUS,
    ])
    expect(new Set(jp.map((g) => g.id)).size).toBe(jp.length)
    expect(new Set(cn.map((g) => g.id)).size).toBe(cn.length)
  })
})

describe('buildPlateCharts', () => {
  const groups = getPlateVersionGroups('jp')
  const g = (id: string) => groups.find((x) => x.id === id)!
  it('places a chart set by its own type version', () => {
    expect(buildPlateCharts(songs, g('kagayaki'), 'jp').map((c) => [c.song.id, c.type])).toEqual([['old', 'std']])
    expect(buildPlateCharts(songs, g('kagami'), 'jp').map((c) => c.song.id)).toEqual(['old', 'cn-gone'])
  })
  it('requires only base difficulties outside 舞 / 覇', () => {
    expect(buildPlateCharts(songs, g('kagayaki'), 'jp')[0]!.requiredSheets).toHaveLength(4)
  })
  it('requires SD-era Re:MASTER for 舞 / 覇 only', () => {
    const charts = buildPlateCharts(songs, g('mai'), 'jp')
    expect(charts.find((c) => c.song.id === 'old')!.requiredSheets).toHaveLength(5)
    expect(charts.find((c) => c.song.id === 'late-re')!.requiredSheets).toHaveLength(4)
  })
  it('excludes charts not on the server and utage', () => {
    const cnKagami = getPlateVersionGroups('cn').find((x) => x.id === 'kagami')!
    expect(buildPlateCharts(songs, cnKagami, 'cn').map((c) => c.song.id)).toEqual(['old'])
  })
  it('CN 华 covers both DX years', () => {
    const cnHana = getPlateVersionGroups('cn').find((x) => x.id === 'hana')!
    expect(buildPlateCharts(songs, cnHana, 'cn').map((c) => c.song.id)).toEqual(['kuma', 'hana'])
  })
})

describe('evaluatePlate', () => {
  it('counts complete, partial and untouched charts', () => {
    const records = new Map<string, PlateRecord>(
      BASE.map((d) => [`kuma:dx:${d}`, { achievementRate: 100.5, comboFlag: 'ap' }]),
    )
    records.set('hana:dx:basic', { achievementRate: 100.5, comboFlag: 'fc' })
    const cnKuma = findPlate('cn', 'kuma-shin')!
    const progress = evaluatePlate({ songs, plate: cnKuma, region: 'cn', records })
    expect(progress.totalCharts).toBe(2)
    expect(progress.completedCharts).toBe(1)
    expect(progress.completedSheets).toBe(4)
    expect(progress.totalSheets).toBe(8)
    expect(progress.charts[1]!.untouched).toBe(false)
    const sho = evaluatePlate({ songs, plate: findPlate('cn', 'kuma-sho')!, region: 'cn', records })
    expect(sho.completedCharts).toBe(1)
    expect(sho.completedSheets).toBe(5)
  })
})
describe('舞ReMASTER membership on the bundled snapshot', () => {
  const mai = getPlateVersionGroups('jp').find((x) => x.id === 'mai')!
  const charts = buildPlateCharts(catalogSnapshot.songs, mai, 'jp')
  const required = new Set(charts.flatMap((c) => c.requiredSheets.map((sheet) => sheet.id)))
  it('excludes DX-era Re:MASTERs that keep the SD song version', () => {
    // JACKY [Remix] (2020) and 源平大戦絵巻テーマソング (2022): version `maimai`, not in the in-game 舞ReMASTER list
    expect(required.has('dsht_dwpg7aq3ar')).toBe(false)
    expect(required.has('dsht_zr62nhjq85')).toBe(false)
    const jacky = charts.find((c) => c.requiredSheets.some((sheet) => sheet.id === 'dsht_dwpg7aq3ar'))
    expect(jacky).toBeUndefined()
  })
  it('keeps SD-era Re:MASTERs', () => {
    // POP TEAM EPIC / ようこそジャパリパークへ Re:MASTER: released in the SD era
    const sdRemasters = catalogSnapshot.songs.flatMap((song) =>
      song.sheets.filter(
        (sheet) =>
          sheet.difficulty === DifficultyEnum.ReMaster &&
          sheet.serverIds.includes('jp') &&
          sheet.releaseDate !== undefined &&
          sheet.releaseDate < '2019-07-11' &&
          ['maimai', 'MiLK PLUS', 'FiNALE'].includes(sheet.version),
      ),
    )
    expect(sdRemasters.length).toBeGreaterThan(0)
    for (const sheet of sdRemasters) expect(required.has(sheet.id)).toBe(true)
  })
})