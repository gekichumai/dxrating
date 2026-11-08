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
  SERVER_VARIANT_REMASTER_SHEET_IDS,
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
          ['maimai', 'MiLK PLUS', 'FiNALE'].includes(sheet.version) &&
          // ジングルベル: on the 舞 exclusion list (meta#58)
          sheet.internalId !== 70,
      ),
    )
    expect(sdRemasters.length).toBeGreaterThan(0)
    for (const sheet of sdRemasters) expect(required.has(sheet.id)).toBe(true)
  })
})
describe('Re:MASTERs that differ between servers (meta#18)', () => {
  // 39, 妄想感傷代償連盟, ヒバナ: owner decision 2026-11-06, they count toward 舞 and 覇者 on every server
  const ids = [...SERVER_VARIANT_REMASTER_SHEET_IDS]
  const regions = ['jp', 'intl', 'cn'] as const

  it('lists the three charts by their public sheet IDs', () => {
    const titles = ids.map((id) => {
      const owner = catalogSnapshot.songs.find((s) => s.sheets.some((sheet) => sheet.id === id))
      const remaster = owner?.sheets.find((sheet) => sheet.id === id)
      expect(remaster?.difficulty).toBe(DifficultyEnum.ReMaster)
      return owner?.title
    })
    expect(titles.sort()).toEqual(['39', 'ヒバナ', '妄想感傷代償連盟'].sort())
  })

  it.each(regions)('counts them toward 舞 and 覇 on %s and flags their chart sets', (region) => {
    for (const groupId of ['mai', 'ha']) {
      const group = getPlateVersionGroups(region).find((x) => x.id === groupId)!
      const charts = buildPlateCharts(catalogSnapshot.songs, group, region)
      for (const id of ids) {
        const chart = charts.find((c) => c.requiredSheets.some((sheet) => sheet.id === id))
        expect(chart, `${groupId} ${region} ${id}`).toBeDefined()
        expect(chart!.hasServerVariantRemaster).toBe(true)
      }
      expect(charts.filter((c) => c.hasServerVariantRemaster)).toHaveLength(ids.length)
    }
  })

  it('counts them in plate progress', () => {
    const plate = findPlate('jp', 'mai-maimai')!
    const fdx: PlateRecord = { achievementRate: 101, comboFlag: 'app', syncFlag: 'fsdp' }
    const charts = buildPlateCharts(catalogSnapshot.songs, plate.group, 'jp').filter((c) => c.hasServerVariantRemaster)
    const baseOnly = new Map<string, PlateRecord>(
      charts.flatMap((c) =>
        c.requiredSheets
          .filter((sheet) => !SERVER_VARIANT_REMASTER_SHEET_IDS.has(sheet.id))
          .map((sheet) => [sheet.id, fdx]),
      ),
    )
    const without = evaluatePlate({ songs: catalogSnapshot.songs, plate, region: 'jp', records: baseOnly })
    const all = new Map(baseOnly)
    for (const id of ids) all.set(id, fdx)
    const withRemaster = evaluatePlate({ songs: catalogSnapshot.songs, plate, region: 'jp', records: all })
    expect(withRemaster.completedCharts - without.completedCharts).toBe(ids.length)
    expect(withRemaster.completedSheets - without.completedSheets).toBe(ids.length)
    expect(withRemaster.totalSheets).toBe(without.totalSheets)
  })

  it('does not add them to other plates or flag other charts', () => {
    const kagayaki = getPlateVersionGroups('jp').find((x) => x.id === 'kagayaki')!
    const charts = buildPlateCharts(catalogSnapshot.songs, kagayaki, 'jp')
    expect(charts.some((c) => c.hasServerVariantRemaster)).toBe(false)
    expect(
      charts.flatMap((c) => c.requiredSheets).some((sheet) => SERVER_VARIANT_REMASTER_SHEET_IDS.has(sheet.id)),
    ).toBe(false)
  })

  it('keeps a listed Re:MASTER even when its data would place it in the DX era', () => {
    const id = ids[0]!
    const pinned = song('pinned', [
      ...base('pinned', TypeEnum.STD, VersionEnum.MiLK),
      sheet('pinned', TypeEnum.STD, DifficultyEnum.ReMaster, VersionEnum.Splash, { id, releaseDate: '2020-01-01' }),
    ])
    const mai = getPlateVersionGroups('jp').find((x) => x.id === 'mai')!
    const [chart] = buildPlateCharts([pinned], mai, 'jp')
    expect(chart!.requiredSheets.map((s) => s.id)).toContain(id)
    expect(chart!.hasServerVariantRemaster).toBe(true)
  })
})
describe('plate exclusion lists (meta#58)', () => {
  const jp = getPlateVersionGroups('jp')
  const g = (id: string) => jp.find((x) => x.id === id)!
  const musicIds = (groupId: string, region: 'jp' | 'intl' | 'cn' = 'jp') =>
    new Set(
      buildPlateCharts(
        catalogSnapshot.songs,
        getPlateVersionGroups(region).find((x) => x.id === groupId)!,
        region,
      ).flatMap((c) => (c.type === TypeEnum.STD ? c.requiredSheets.map((sheet) => sheet.internalId) : [])),
    )

  it('declares the exclusions documented in the issue', () => {
    expect(g('shin-ver').excludedMusicIds).toEqual([70])
    expect(g('sumire').excludedMusicIds).toEqual([853])
    expect(g('mai').excludedMusicIds).toEqual([70, 853])
    expect(g('ha').excludedMusicIds).toEqual([70, 853])
  })

  it.each(['jp', 'intl', 'cn'] as const)(
    'leaves ジングルベル and 前前前世 out of 真, 菫, 舞 and 覇 on %s',
    (region) => {
      expect(musicIds('shin-ver', region).has(70)).toBe(false)
      expect(musicIds('sumire', region).has(853)).toBe(false)
      for (const id of ['mai', 'ha']) {
        expect(musicIds(id, region).has(70)).toBe(false)
        expect(musicIds(id, region).has(853)).toBe(false)
      }
    },
  )

  it('still requires the songs next to them', () => {
    // The songs stay in the catalog; only the excluding plates drop them
    const all = catalogSnapshot.songs.flatMap((s) => s.sheets.map((sheet) => sheet.internalId))
    expect(all).toContain(70)
    expect(all).toContain(853)
    expect(musicIds('murasaki').size).toBeGreaterThan(0)
  })

  it('matches a DX chart set by its own internal ID only', () => {
    const fixture = [
      song(
        'std-70',
        base('std-70', TypeEnum.STD, VersionEnum.Maimai).map((s) => ({ ...s, internalId: 70 })),
      ),
      // A DX chart set with the STD ID (dxdata bug, meta#56) is a different chart set: 10070
      song(
        'dx-70',
        base('dx-70', TypeEnum.DX, VersionEnum.Maimai).map((s) => ({ ...s, internalId: 70 })),
      ),
      song(
        'dx-853',
        base('dx-853', TypeEnum.DX, VersionEnum.Maimai).map((s) => ({ ...s, internalId: 10853 })),
      ),
    ]
    const shin = buildPlateCharts(fixture, g('shin-ver'), 'jp').map((c) => c.song.id)
    expect(shin).toEqual(['dx-70', 'dx-853'])
  })
})

describe('plate song counts on the bundled snapshot (meta#57, meta#58)', () => {
  // Chart sets and required sheets per plate. 真, 菫 and 舞 / 覇 drop the excluded songs: 真 89 → 88 (−70),
  // 菫 42 → 41 (−853), 舞 / 覇 573 → 571 (−70, −853, Re:MASTER of 70 included)
  const expected: Record<'jp' | 'intl' | 'cn', Record<string, [charts: number, sheets: number]>> = {
    jp: {
      'shin-ver': [88, 352],
      sumire: [41, 164],
      mai: [571, 2348],
      ha: [571, 2348],
      irodori: [80, 320],
      maru: [78, 312],
      meguri: [72, 288],
    },
    intl: { 'shin-ver': [88, 352], sumire: [41, 164], mai: [571, 2348], ha: [571, 2348] },
    cn: { 'shin-ver': [86, 344], sumire: [39, 156], mai: [527, 2169], ha: [527, 2169] },
  }
  for (const [region, plates] of Object.entries(expected) as [
    'jp' | 'intl' | 'cn',
    Record<string, [number, number]>,
  ][]) {
    it.each(Object.entries(plates))(`${region} %s`, (groupId, [charts, sheets]) => {
      const group = getPlateVersionGroups(region).find((x) => x.id === groupId)!
      const built = buildPlateCharts(catalogSnapshot.songs, group, region)
      expect(built).toHaveLength(charts)
      expect(built.reduce((n, c) => n + c.requiredSheets.length, 0)).toBe(sheets)
    })
  }
})

describe('廻 plates (meta#57)', () => {
  it('lists 廻極 / 廻将 / 廻神 / 廻舞舞 for CiRCLE PLUS on JP', () => {
    const meguri = getPlateVersionGroups('jp').find((x) => x.id === 'meguri')!
    expect(meguri.versions).toEqual([VersionEnum.CiRCLEPLUS])
    expect(meguri.unverified).toBeUndefined()
    expect(
      listPlates('jp')
        .filter((p) => p.group.id === 'meguri')
        .map((p) => plateName(p)),
    ).toEqual(['廻極', '廻将', '廻神', '廻舞舞'])
    const charts = buildPlateCharts(catalogSnapshot.songs, meguri, 'jp')
    expect(charts.every((c) => c.version === VersionEnum.CiRCLEPLUS)).toBe(true)
  })
  it('confirms 彩 and 丸 on JP', () => {
    const jp = getPlateVersionGroups('jp')
    expect(jp.find((x) => x.id === 'irodori')!.unverified).toBeUndefined()
    expect(jp.find((x) => x.id === 'maru')!.unverified).toBeUndefined()
  })
  it('is not on INTL or CN yet, and MAGiCAL has no plate', () => {
    expect(findPlate('intl', 'meguri-shin')).toBeUndefined()
    expect(findPlate('cn', 'meguri-shin')).toBeUndefined()
    for (const region of ['jp', 'intl', 'cn'] as const) {
      expect(getPlateVersionGroups(region).some((x) => x.versions.includes(VersionEnum.MAGiCAL))).toBe(false)
    }
  })
  it('covers every JP version up to CiRCLE PLUS exactly once', () => {
    const versions = getPlateVersionGroups('jp')
      .filter((x) => x.id !== 'mai' && x.id !== 'ha')
      .flatMap((x) => x.versions)
    expect(new Set(versions).size).toBe(versions.length)
    const all = Object.values(VersionEnum).filter((v) => v !== VersionEnum.MAGiCAL)
    expect([...versions].sort()).toEqual([...all].sort())
  })
})