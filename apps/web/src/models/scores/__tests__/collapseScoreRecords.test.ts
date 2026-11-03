import type { Best50Bucket, ComboFlag, SyncFlag } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { LocalScoreRepository } from '../LocalScoreRepository'
import { collapseScoreRecords } from '../collapseScoreRecords'
import type { ScoreRecord } from '../ScoreRepository'

const IDENTITY = { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' } as const
const SHEET = 'dsht_e5nsvt8k2a'

const record = (overrides: Partial<ScoreRecord>): ScoreRecord => ({
  sheetId: SHEET,
  identity: IDENTITY,
  achievement: 1000000,
  achievementRate: 100,
  comboFlag: null,
  syncFlag: null,
  dxScore: null,
  best50Bucket: null,
  provenance: null,
  ...overrides,
})

const COMBO: ComboFlag[] = [null, 'fc', 'fcp', 'ap', 'app']
const SYNC: SyncFlag[] = [null, 'sync', 'fs', 'fsp', 'fsd', 'fsdp']

describe('collapseScoreRecords', () => {
  it('takes the higher achievement with its display rate', () => {
    const low = record({ achievement: 990000, achievementRate: 99 })
    const high = record({ achievement: 1005432, achievementRate: 100.5432 })
    for (const [a, b] of [
      [low, high],
      [high, low],
    ] as const) {
      expect(collapseScoreRecords(a, b)).toMatchObject({ achievement: 1005432, achievementRate: 100.5432 })
    }
  })

  it.each(COMBO.flatMap((a, i) => COMBO.map((b, j) => [a, b, COMBO[Math.max(i, j)]] as const)))(
    'combo %s + %s = %s',
    (a, b, expected) => {
      expect(collapseScoreRecords(record({ comboFlag: a }), record({ comboFlag: b })).comboFlag).toBe(expected)
    },
  )

  it.each(SYNC.flatMap((a, i) => SYNC.map((b, j) => [a, b, SYNC[Math.max(i, j)]] as const)))(
    'sync %s + %s = %s',
    (a, b, expected) => {
      expect(collapseScoreRecords(record({ syncFlag: a }), record({ syncFlag: b })).syncFlag).toBe(expected)
    },
  )

  it.each([
    [null, null, null],
    [null, 1800, 1800],
    [1800, null, 1800],
    [1700, 1800, 1800],
    [1800, 1700, 1800],
    [0, null, 0],
  ] as const)('dxScore %s + %s = %s', (a, b, expected) => {
    expect(collapseScoreRecords(record({ dxScore: a }), record({ dxScore: b })).dxScore).toBe(expected)
  })

  it('takes each field from a different duplicate independently', () => {
    const collapsed = collapseScoreRecords(
      record({ achievement: 1007000, achievementRate: 100.7, comboFlag: 'fc', syncFlag: null, dxScore: 1500 }),
      record({ achievement: 995000, achievementRate: 99.5, comboFlag: 'ap', syncFlag: 'fsd', dxScore: 1600 }),
    )
    expect(collapsed).toMatchObject({
      achievement: 1007000,
      achievementRate: 100.7,
      comboFlag: 'ap',
      syncFlag: 'fsd',
      dxScore: 1600,
    })
  })

  // [a achievement, a bucket, b achievement, b bucket, expected]
  it.each<[number, Best50Bucket | null, number, Best50Bucket | null, Best50Bucket | null]>([
    [1000000, null, 1000000, null, null],
    [1000000, 'b35', 990000, null, 'b35'],
    [990000, null, 1000000, 'b15', 'b15'],
    // the hint of the lower achievement still wins over no hint
    [1005000, null, 990000, 'b35', 'b35'],
    [1005000, 'b35', 990000, 'b15', 'b35'],
    [990000, 'b35', 1005000, 'b15', 'b15'],
    [1005000, 'b15', 990000, 'b35', 'b15'],
    [990000, 'b15', 1005000, 'b35', 'b35'],
    // equal achievements: b15
    [1000000, 'b35', 1000000, 'b15', 'b15'],
    [1000000, 'b15', 1000000, 'b35', 'b15'],
    [1000000, 'b35', 1000000, 'b35', 'b35'],
  ])('bucket %i/%s + %i/%s = %s', (aAchievement, aBucket, bAchievement, bBucket, expected) => {
    const collapsed = collapseScoreRecords(
      record({ achievement: aAchievement, best50Bucket: aBucket }),
      record({ achievement: bAchievement, best50Bucket: bBucket }),
    )
    expect(collapsed.best50Bucket).toBe(expected)
  })

  it('keeps the identity and provenance of the record seen first', () => {
    const first = record({ achievement: 990000 })
    const collapsed = collapseScoreRecords(first, record({ achievement: 1000000, identity: { ...IDENTITY } }))
    expect(collapsed.identity).toBe(first.identity)
    expect(collapsed.provenance).toBeNull()
  })
})

describe('LocalScoreRepository with duplicate entries', () => {
  const divingFish = (bucket: Best50Bucket) =>
    ({
      source: { provider: 'diving-fish', best50Bucket: bucket },
      providerConfig: { divingFish: { ratingEligibility: bucket } },
    }) as const

  const ENTRIES = [
    {
      sheetId: SHEET,
      identity: IDENTITY,
      achievementRate: 100.7,
      comboFlag: 'fc',
      dxScore: 1500,
      ...divingFish('b35'),
    },
    { sheetId: 'dsht_5mk3yr8gme', identity: { songId: 'x', type: 'std', difficulty: 'basic' }, achievementRate: 98 },
    { sheetId: SHEET, identity: IDENTITY, achievementRate: 99.5, comboFlag: 'ap', syncFlag: 'fsd', dxScore: 1600 },
    { sheetId: SHEET, identity: IDENTITY, achievementRate: 100.2, syncFlag: 'fs', ...divingFish('b15') },
    // not a valid record: ignored by the collapse
    { sheetId: SHEET, identity: IDENTITY, achievementRate: 120, comboFlag: 'app' },
  ] as PlayEntry[]

  it('lists exactly one record per chart, in first-seen order', () => {
    const repository = LocalScoreRepository.inMemory(ENTRIES)
    expect(repository.list().map((r) => r.sheetId)).toEqual([SHEET, 'dsht_5mk3yr8gme'])
    expect(repository.list()[0]).toEqual({
      sheetId: SHEET,
      identity: IDENTITY,
      achievement: 1007000,
      achievementRate: 100.7,
      comboFlag: 'ap',
      syncFlag: 'fsd',
      dxScore: 1600,
      best50Bucket: 'b35',
      provenance: null,
    })
  })

  it('returns the collapsed record from get()', () => {
    const repository = LocalScoreRepository.inMemory(ENTRIES)
    expect(repository.get(SHEET)).toBe(repository.list()[0])
  })

  it('keeps every saved entry in the stored form', () => {
    expect(LocalScoreRepository.inMemory(ENTRIES).entries()).toHaveLength(ENTRIES.length)
  })
})