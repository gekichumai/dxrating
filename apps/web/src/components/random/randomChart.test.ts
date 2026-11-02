import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { countActiveFilters, DEFAULT_RANDOM_FILTERS, filterRandomPool, pickRandom } from './randomChart'

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

  it('applies level range inclusively over the whole upper level', () => {
    const ids = filterRandomPool(sheets, { ...DEFAULT_RANDOM_FILTERS, minLevel: 12, maxLevel: 14 }, 'jp').map(
      (s) => s.id,
    )
    expect(ids).toEqual(['a', 'b'])
  })

  it('filters by type and region, never utage', () => {
    const ids = filterRandomPool(sheets, { ...DEFAULT_RANDOM_FILTERS, minLevel: 1, types: [TypeEnum.DX] }, 'jp').map(
      (s) => s.id,
    )
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
    expect(countActiveFilters({ ...DEFAULT_RANDOM_FILTERS, minLevel: 1, maxLevel: 15 })).toBe(0)
    expect(countActiveFilters(DEFAULT_RANDOM_FILTERS)).toBe(1)
  })
})