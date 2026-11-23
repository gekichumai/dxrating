import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { best50HintOf, toRatingEntries } from '../rating-entries'
import type { SongCatalog } from '../song-catalog'
import type { SheetIdentity, StoredPlay } from '../types'

const identity: SheetIdentity = { songId: 'dsng_a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
const catalog = { getById: (id: string) => (id === 'dsht_a' ? { identity } : null) } as unknown as SongCatalog

describe('best50HintOf', () => {
  it.each<[string, StoredPlay, 'b15' | 'b35' | null]>([
    [
      'the stored Diving-Fish eligibility',
      { sheetId: 'dsht_a', achievementRate: 99, providerConfig: { divingFish: { ratingEligibility: 'b15' } } },
      'b15',
    ],
    [
      'a Diving-Fish source bucket',
      { sheetId: 'dsht_a', achievementRate: 99, source: { provider: 'diving-fish', best50Bucket: 'b35' } },
      'b35',
    ],
    [
      'the eligibility over the source',
      {
        sheetId: 'dsht_a',
        achievementRate: 99,
        source: { provider: 'diving-fish', best50Bucket: 'b35' },
        providerConfig: { divingFish: { ratingEligibility: 'b15' } },
      },
      'b15',
    ],
    [
      'no bucket of another provider',
      { sheetId: 'dsht_a', achievementRate: 99, source: { provider: 'lxns', best50Bucket: 'b15' } },
      null,
    ],
  ])('reads %s', (_, play, hint) => {
    expect(best50HintOf(play)).toBe(hint)
  })
})

describe('toRatingEntries', () => {
  it('keeps duplicate plays and the hint of each, and drops charts the catalog does not know', () => {
    const entries = toRatingEntries(
      [
        { sheetId: 'dsht_a', achievementRate: 100.1, comboFlag: 'ap' },
        { sheetId: 'dsht_a', achievementRate: 99, providerConfig: { divingFish: { ratingEligibility: 'b15' } } },
        { sheetId: 'dsht_unknown', achievementRate: 100 },
      ],
      catalog,
    )
    expect(entries).toEqual([
      { sheetId: 'dsht_a', identity, achievementRate: 100.1, comboFlag: 'ap', syncFlag: undefined, source: undefined },
      {
        sheetId: 'dsht_a',
        identity,
        achievementRate: 99,
        comboFlag: undefined,
        syncFlag: undefined,
        source: { provider: 'diving-fish', best50Bucket: 'b15' },
      },
    ])
  })
})