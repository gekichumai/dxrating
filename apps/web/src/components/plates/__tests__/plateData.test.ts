import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import {
  buildPlateIndex,
  buildPlatePageData,
  evaluatePlatePage,
  groupPlateChartsByLevel,
  listIndexablePlateIds,
  parsePlateRegion,
  platePath,
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

  it('returns null for unknown plates', () => {
    expect(buildPlatePageData(catalogSnapshot, 'jp', 'nope-sho')).toBeNull()
    expect(buildPlatePageData(catalogSnapshot, 'cn', 'maru-shin')).toBeNull()
  })
})