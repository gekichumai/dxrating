import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import {
  CONSTANT_TABLE_LEVELS,
  buildConstantTable,
  constantTablePath,
  constantTableLevelOf,
  parseConstantTableSlug,
} from '../constantTables'

describe('constant table slugs', () => {
  it('round-trips + levels through the p slug', () => {
    expect(constantTablePath('14+')).toBe('/constants/14p')
    expect(parseConstantTableSlug('14p')).toBe('14+')
    expect(parseConstantTableSlug('14P')).toBe('14+')
    expect(parseConstantTableSlug('14')).toBe('14')
    expect(parseConstantTableSlug('9')).toBeNull()
    expect(constantTableLevelOf('13+')).toBe('13+')
    expect(constantTableLevelOf('8')).toBeNull()
  })
})

describe('buildConstantTable', () => {
  it('groups every chart of the level by internal level, high to low', () => {
    const table = buildConstantTable(catalogSnapshot, '14+')

    expect(table.chartCount).toBeGreaterThan(50)
    const constants = table.groups.map((group) => Number(group.constant))
    expect(constants).toEqual([...constants].sort((a, b) => b - a))
    for (const group of table.groups) {
      for (const chart of group.charts) {
        expect(chart.internalLevelValue.toFixed(1)).toBe(group.constant)
        expect(['dx', 'std']).toContain(chart.type)
        expect(chart.href).toMatch(/^\/songs\/dsng_/)
        expect(chart.ratingSssPlus).toBeGreaterThan(chart.ratingSss)
      }
    }
  })

  it('computes the single-chart rating at SSS+', () => {
    const chart = buildConstantTable(catalogSnapshot, '14+').groups[0]!.charts[0]!
    expect(chart.ratingSssPlus).toBe(
      Math.floor((Math.round(chart.internalLevelValue * 10) * 1005000 * 224) / 100000000),
    )
  })

  it('has a non-empty table for every listed level', () => {
    for (const level of CONSTANT_TABLE_LEVELS) {
      expect(buildConstantTable(catalogSnapshot, level).chartCount, level).toBeGreaterThan(0)
    }
  })
})