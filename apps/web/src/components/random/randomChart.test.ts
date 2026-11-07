import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import {
  countActiveFilters,
  DEFAULT_RANDOM_FILTERS,
  filterRandomPool,
  findRolledChart,
  parseRolledChartParam,
  pickRandom,
} from './randomChart'

const sheet = (overrides: Partial<VersionedSheet>): VersionedSheet =>
  ({
    id: 'dsht_x',
    type: TypeEnum.DX,
    difficulty: DifficultyEnum.Master,
    internalLevelValue: 13.5,
    version: 'maimai',
    serverIds: ['jp'],
    isTypeUtage: false,
    ...overrides,
  }) as VersionedSheet

describe('filterRandomPool', () => {
  const sheets = [
    sheet({ id: 'a' }),
    sheet({ id: 'b', type: TypeEnum.STD, internalLevelValue: 14.9 }),
    sheet({ id: 'c', internalLevelValue: 11.9 }),
    sheet({ id: 'd', serverIds: ['cn'] }),
    sheet({ id: 'e', isTypeUtage: true }),
  ]

  it('applies the level range inclusively at both ends, in 0.1 steps', () => {
    const ids = (min: number, max: number) =>
      filterRandomPool(sheets, { ...DEFAULT_RANDOM_FILTERS, range: { min, max } }, 'jp').map((s) => s.id)
    expect(ids(120, 149)).toEqual(['a', 'b'])
    expect(ids(135, 135)).toEqual(['a'])
    expect(ids(136, 148)).toEqual([])
    expect(ids(119, 119)).toEqual(['c'])
  })

  it('filters by type and region, never utage', () => {
    const ids = filterRandomPool(
      sheets,
      { ...DEFAULT_RANDOM_FILTERS, range: { min: 10, max: 150 }, types: [TypeEnum.DX] },
      'jp',
    ).map((s) => s.id)
    expect(ids).toEqual(['a', 'c'])
  })
})

describe('pickRandom', () => {
  it('returns null for an empty pool and stays in bounds', () => {
    expect(pickRandom([])).toBeNull()
    expect(pickRandom([1, 2, 3], () => 0.9999999)).toBe(3)
  })
})

describe('countActiveFilters', () => {
  it('counts the level range only when narrowed', () => {
    expect(countActiveFilters({ ...DEFAULT_RANDOM_FILTERS, range: { min: 10, max: 150 } })).toBe(0)
    expect(countActiveFilters(DEFAULT_RANDOM_FILTERS)).toBe(1)
  })
})

describe('filterRandomPool game-version ceiling', () => {
  const sheets = [
    sheet({ id: 'prism', version: VersionEnum.PRiSM }),
    sheet({ id: 'magical', version: VersionEnum.MAGiCAL }),
  ]
  it('drops charts newer than the selected game version, also with no version filter', () => {
    const ids = (max: VersionEnum) => filterRandomPool(sheets, DEFAULT_RANDOM_FILTERS, 'jp', max).map((s) => s.id)
    expect(ids(VersionEnum.PRiSM)).toEqual(['prism'])
    // A new selection re-evaluates the pool
    expect(ids(VersionEnum.MAGiCAL)).toEqual(['prism', 'magical'])
  })
})
describe('the rolled chart in the URL', () => {
  it('accepts only public sheet IDs', () => {
    expect(parseRolledChartParam('dsht_abc123')).toBe('dsht_abc123')
    expect(parseRolledChartParam('dsht_')).toBeUndefined()
    expect(parseRolledChartParam('../etc')).toBeUndefined()
    expect(parseRolledChartParam(42)).toBeUndefined()
    expect(parseRolledChartParam(undefined)).toBeUndefined()
  })

  it('finds the chart the link names, or nothing', () => {
    const sheets = [{ id: 'dsht_a' }, { id: 'dsht_b' }]
    expect(findRolledChart(sheets, 'dsht_b')).toBe(sheets[1])
    expect(findRolledChart(sheets, 'dsht_gone')).toBeNull()
    expect(findRolledChart(sheets, undefined)).toBeNull()
  })
})