import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import {
  buildPlateIndex,
  buildPlatePageData,
  evaluatePlatePage,
  groupPlateChartsByLevel,
  listIndexablePlateIds,
  parsePlateRegion,
  plateExistsInRegion,
  plateRegionToFollow,
  platePath,
  plateRegionSearch,
} from '../plateData'

describe('plate page data', () => {
  it('lists real plates only (no 真将) and parses regions', () => {
    const ids = listIndexablePlateIds()
    expect(ids).toContain('akatsuki-sho')
    expect(ids).toContain('ha-hasha')
    expect(ids).not.toContain('shin-ver-sho')
    expect(parsePlateRegion('cn')).toBe('cn')
    expect(parsePlateRegion('kr')).toBeUndefined()
    expect(platePath('kagami-shin')).toBe('/plates/kagami-shin')
    expect(buildPlateIndex('cn').some((group) => group.id === 'maru')).toBe(false)
  })

  it('builds lean SSR data and overlays records on the client', () => {
    const data = buildPlatePageData(catalogSnapshot, 'jp', 'akatsuki-sho')
    expect(data).not.toBeNull()
    if (!data) return
    expect(data.charts.length).toBeGreaterThan(0)
    expect(data.names).toEqual({ ja: '暁将', zh: '晓将' })
    expect(data.totalSheets).toBe(data.charts.reduce((sum, chart) => sum + chart.sheets.length, 0))

    const [first] = data.charts
    const records = new Map(first.sheets.map((sheet) => [sheet.id, { achievementRate: 100.2 }]))
    const progress = evaluatePlatePage(data, records)
    expect(progress.completedCharts).toBe(1)
    expect(progress.completedSheets).toBe(first.sheets.length)
    expect(progress.charts[0].complete).toBe(true)

    const groups = groupPlateChartsByLevel(data.charts)
    expect(groups.reduce((sum, group) => sum + group.charts.length, 0)).toBe(data.charts.length)
    expect(new Set(groups.map((group) => group.level)).size).toBe(groups.length)
  })

  it('flags the Re:MASTERs that differ between servers on 舞 and 覇者 only (meta#18)', () => {
    for (const region of ['jp', 'intl', 'cn'] as const) {
      for (const plateId of ['mai-maimai', 'ha-hasha']) {
        const data = buildPlatePageData(catalogSnapshot, region, plateId)!
        const flagged = data.charts.filter((chart) => chart.remasterDiffersByServer)
        expect(flagged.map((chart) => chart.title).sort(), `${region} ${plateId}`).toEqual(
          ['39', 'ヒバナ', '妄想感傷代償連盟'].sort(),
        )
        for (const chart of flagged) expect(chart.sheets.at(-1)!.difficulty).toBe('remaster')
      }
    }
    const kagayaki = buildPlatePageData(catalogSnapshot, 'jp', 'kagayaki-shin')!
    expect(kagayaki.charts.some((chart) => chart.remasterDiffersByServer)).toBe(false)
  })

  it('returns null for unknown plates', () => {
    expect(buildPlatePageData(catalogSnapshot, 'jp', 'nope-sho')).toBeNull()
    expect(buildPlatePageData(catalogSnapshot, 'cn', 'maru-shin')).toBeNull()
  })
})

describe('regional plate projection', () => {
  const chartSheet = (region: 'jp' | 'intl', plateId: string, sheetId: string) => {
    const data = buildPlatePageData(catalogSnapshot, region, plateId)!
    const chart = data.charts.find((c) => c.sheets.some((sheet) => sheet.id === sheetId))!
    return { chart, sheet: chart.sheets.find((sheet) => sheet.id === sheetId)! }
  }

  it('uses the server level override for the Master grouping and every sheet', () => {
    // 回レ！雪月花 DX Master: 12+ / 12.7, International override 12 / 12.0
    const intl = chartSheet('intl', 'kuma-sho', 'dsht_j7kvr7fcz6')
    expect([intl.chart.level, intl.chart.levelValue]).toEqual(['12', 12])
    expect([intl.sheet.level, intl.sheet.internalLevelValue]).toEqual(['12', 12])
    const jp = chartSheet('jp', 'kuma-sho', 'dsht_j7kvr7fcz6')
    expect([jp.chart.level, jp.chart.levelValue]).toEqual(['12+', 12.7])
  })

  it('overrides non-Master sheets too', () => {
    // We Gonna Party Advanced: 9 / 9.3, International override 8+ / 8.6
    const { sheet } = chartSheet('intl', 'shin-ver-shin', 'dsht_xhhkazcnq5')
    expect([sheet.level, sheet.internalLevelValue]).toEqual(['8+', 8.6])
  })

  it('keeps the server in plate links, implicit for the default one', () => {
    expect(plateRegionSearch('cn')).toEqual({ region: 'cn' })
    expect(plateRegionSearch('intl')).toEqual({ region: 'intl' })
    expect(plateRegionSearch('jp')).toEqual({ region: undefined })
  })
})
describe('plateRegionToFollow', () => {
  it('follows the header region on load when the URL names none', () => {
    expect(plateRegionToFollow({ siteRegion: 'intl', current: 'jp', onLoad: true, explicit: false })).toBe('intl')
    expect(plateRegionToFollow({ siteRegion: 'cn', current: 'jp', onLoad: true, explicit: false })).toBe('cn')
  })

  it('keeps a region the URL names on load, but follows a later header switch', () => {
    expect(plateRegionToFollow({ siteRegion: 'intl', current: 'jp', onLoad: true, explicit: true })).toBeNull()
    expect(plateRegionToFollow({ siteRegion: 'intl', current: 'jp', onLoad: false, explicit: true })).toBe('intl')
  })

  it('stays when the regions already agree, the header region has no plates, or the plate is missing there', () => {
    expect(plateRegionToFollow({ siteRegion: 'jp', current: 'jp', onLoad: true, explicit: false })).toBeNull()
    expect(plateRegionToFollow({ siteRegion: '_generic', current: 'jp', onLoad: false, explicit: false })).toBeNull()
    expect(
      plateRegionToFollow({
        siteRegion: 'intl',
        current: 'jp',
        onLoad: false,
        explicit: false,
        available: () => false,
      }),
    ).toBeNull()
  })

  it('knows which plates each region has', () => {
    const [jpPlate] = buildPlateIndex('jp').flatMap((group) => group.plates)
    expect(plateExistsInRegion('jp', jpPlate!.id)).toBe(true)
    expect(plateExistsInRegion('jp', 'no-such-plate')).toBe(false)
  })
})