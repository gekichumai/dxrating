import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import {
  chipCoverage,
  LEVEL_CHIPS,
  levelChipRange,
  normalizeRange,
  RANGE_FLOOR,
  spanChips,
  stepRange,
  toTenths,
} from './levelRange'

describe('levelChipRange', () => {
  it('maps a level to its internal-level span', () => {
    expect(levelChipRange('13')).toEqual({ min: 130, max: 135 })
    expect(levelChipRange('13+')).toEqual({ min: 136, max: 139 })
    expect(levelChipRange('10')).toEqual({ min: 100, max: 105 })
    // Top of the scale
    expect(levelChipRange('15')).toEqual({ min: 150, max: 150 })
  })

  it('matches every chart of level 10 and up in the bundled dxdata', () => {
    const mismatches: string[] = []
    let checked = 0
    for (const song of catalogSnapshot.songs) {
      for (const sheet of song.sheets) {
        // `13?` and similar are unconfirmed levels; utage has its own scale
        if (sheet.type === 'utage' || sheet.internalLevelValue == null || !/^\d+\+?$/.test(sheet.level)) continue
        if (Number.parseInt(sheet.level, 10) < 10) continue
        checked++
        const range = levelChipRange(sheet.level)
        const tenths = toTenths(sheet.internalLevelValue)
        if (tenths < range.min || tenths > range.max) mismatches.push(`${song.title} ${sheet.level} ${tenths}`)
      }
    }
    expect(checked).toBeGreaterThan(1000)
    // One known data quirk (an international-only downgrade); anything more means the mapping is wrong
    expect(mismatches.length).toBeLessThanOrEqual(1)
  })
})

describe('chip selection', () => {
  it('spans two chips in either order', () => {
    expect(spanChips('13+', '12')).toEqual({ min: 120, max: 139 })
    expect(spanChips('12', '13+')).toEqual({ min: 120, max: 139 })
    expect(spanChips('14', '14')).toEqual({ min: 140, max: 145 })
  })

  it('highlights chips fully inside the range and marks partial overlap', () => {
    const range = { min: 137, max: 142 }
    expect(LEVEL_CHIPS.map((chip) => chipCoverage(chip, range))).toEqual([
      'none',
      'none',
      'none',
      'none',
      'none',
      'partial',
      'partial',
      'none',
      'none',
    ])
    expect(chipCoverage('13+', { min: 130, max: 140 })).toBe('inside')
    expect(chipCoverage('13', { min: 130, max: 140 })).toBe('inside')
    expect(chipCoverage('14', { min: 130, max: 140 })).toBe('partial')
  })
})

describe('stepRange', () => {
  it('moves one end by 0.1 and never crosses the other end or the floor', () => {
    const range = { min: 137, max: 142 }
    expect(stepRange(range, 'min', 1, RANGE_FLOOR)).toEqual({ min: 138, max: 142 })
    expect(stepRange(range, 'max', -1, RANGE_FLOOR)).toEqual({ min: 137, max: 141 })
    expect(stepRange({ min: 140, max: 140 }, 'min', 1, RANGE_FLOOR)).toEqual({ min: 140, max: 140 })
    expect(stepRange({ min: 90, max: 100 }, 'min', -1, RANGE_FLOOR)).toEqual({ min: 90, max: 100 })
    expect(stepRange({ min: 140, max: 150 }, 'max', 1, RANGE_FLOOR)).toEqual({ min: 140, max: 150 })
  })

  it('normalizes out-of-scale and swapped ranges', () => {
    expect(normalizeRange({ min: 160, max: 0 })).toEqual({ min: 10, max: 150 })
    expect(normalizeRange({ min: 50, max: 120 }, RANGE_FLOOR)).toEqual({ min: 90, max: 120 })
  })
})