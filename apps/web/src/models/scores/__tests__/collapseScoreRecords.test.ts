import { calculateRatingAward, type Best50Bucket, type ComboFlag, type SyncFlag } from '@gekichumai/maimai-domain'
import { describe, expect, it, vi } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { LocalScoreRepository } from '../LocalScoreRepository'
import { collapseScoreRecordList, collapseScoreRecords } from '../collapseScoreRecords'
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

  it('keeps a single record as it is', () => {
    const single = record({ best50Bucket: 'b35' })
    expect(collapseScoreRecordList([single]).get(SHEET)).toBe(single)
  })

  describe('best50Bucket is ranked by the hint record, not the aggregate, in any order', () => {
    const NO_HINT = record({ achievement: 1005000, achievementRate: 100.5 })
    const B35 = record({ achievement: 990000, achievementRate: 99, best50Bucket: 'b35' })
    const B15 = record({ achievement: 1000000, achievementRate: 100, best50Bucket: 'b15' })
    const permutations = <T>(items: T[]): T[][] =>
      items.length <= 1
        ? [items]
        : items.flatMap((item, i) =>
            permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
          )
    const ORDERS = permutations([NO_HINT, B35, B15])

    it('has 6 orders', () => expect(ORDERS).toHaveLength(6))

    it.each(ORDERS.map((order) => [order.map((r) => r.best50Bucket ?? 'none').join(', '), order] as const))(
      '%s',
      (_, order) => {
        for (const internalLevel of [13, null]) {
          const collapsed = collapseScoreRecordList(order, () => internalLevel).get(SHEET)
          expect(collapsed).toMatchObject({ achievement: 1005000, achievementRate: 100.5, best50Bucket: 'b15' })
        }
      },
    )
  })

  describe('with the internal level known, the hint calculateBest50 keeps (rating with the AP bonus first)', () => {
    const AP = record({ achievement: 1000000, achievementRate: 100, comboFlag: 'ap', best50Bucket: 'b35' })
    const HIGHER = record({ achievement: 1000001, achievementRate: 100.0001, best50Bucket: 'b15' })

    it('rates the AP play higher at level 13', () => {
      expect(calculateRatingAward(13, 100, 'ap').ratingAwardValue).toBe(281)
      expect(calculateRatingAward(13, 100.0001, null).ratingAwardValue).toBe(280)
    })

    it.each([
      [AP, HIGHER],
      [HIGHER, AP],
    ])('takes the AP hint over a higher achievement (%#)', (a, b) => {
      expect(collapseScoreRecords(a, b, 13)).toMatchObject({
        achievement: 1000001,
        comboFlag: 'ap',
        best50Bucket: 'b35',
      })
    })

    it.each([
      [AP, HIGHER],
      [HIGHER, AP],
    ])('falls back to the higher achievement without the internal level (%#)', (a, b) => {
      expect(collapseScoreRecords(a, b).best50Bucket).toBe('b15')
      expect(collapseScoreRecords(a, b, null).best50Bucket).toBe('b15')
    })

    it.each([
      [AP, HIGHER],
      [HIGHER, AP],
    ])('resolves the internal level per chart (%#)', (a, b) => {
      const levels: Record<string, number> = { [SHEET]: 13 }
      expect(collapseScoreRecordList([a, b], (sheetId) => levels[sheetId]).get(SHEET)?.best50Bucket).toBe('b35')
    })

    it('takes the higher achievement on equal ratings, then b15', () => {
      // 100.0000% and 100.0002% both rate 280 at level 13
      const lower = record({ achievement: 1000000, achievementRate: 100, best50Bucket: 'b15' })
      const higher = record({ achievement: 1000002, achievementRate: 100.0002, best50Bucket: 'b35' })
      expect(collapseScoreRecords(lower, higher, 13).best50Bucket).toBe('b35')
      expect(collapseScoreRecords(higher, lower, 13).best50Bucket).toBe('b35')
      const b35 = record({ best50Bucket: 'b35' })
      const b15 = record({ best50Bucket: 'b15' })
      expect(collapseScoreRecords(b35, b15, 13).best50Bucket).toBe('b15')
      expect(collapseScoreRecords(b15, b35, 13).best50Bucket).toBe('b15')
    })
  })

  describe('with the internal level unknown: achievement, then AP, then b15', () => {
    it.each<[ComboFlag | null, ComboFlag | null, Best50Bucket]>([
      ['ap', null, 'b35'],
      ['app', 'fcp', 'b35'],
      [null, 'ap', 'b15'],
      ['ap', 'app', 'b15'],
      [null, null, 'b15'],
    ])('b35 %s + b15 %s at equal achievements = %s', (b35Combo, b15Combo, expected) => {
      const b35 = record({ comboFlag: b35Combo, best50Bucket: 'b35' })
      const b15 = record({ comboFlag: b15Combo, best50Bucket: 'b15' })
      expect(collapseScoreRecords(b35, b15).best50Bucket).toBe(expected)
      expect(collapseScoreRecords(b15, b35).best50Bucket).toBe(expected)
    })
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

  it('ranks the hints by rating once the internal level is known', () => {
    const repository = LocalScoreRepository.inMemory([
      { sheetId: SHEET, identity: IDENTITY, achievementRate: 100.0001, ...divingFish('b15') },
      { sheetId: SHEET, identity: IDENTITY, achievementRate: 100, comboFlag: 'ap', ...divingFish('b35') },
    ] as PlayEntry[])
    expect(repository.get(SHEET)?.best50Bucket).toBe('b15')
    const onChange = vi.fn()
    repository.subscribe(onChange)
    repository.setInternalLevelResolver((sheetId) => (sheetId === SHEET ? 13 : undefined))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(repository.get(SHEET)?.best50Bucket).toBe('b35')
  })

  it('takes a best 50 hint from Diving-Fish only', () => {
    const repository = LocalScoreRepository.inMemory([
      { sheetId: SHEET, identity: IDENTITY, achievementRate: 100, source: { provider: 'lxns', best50Bucket: 'b15' } },
      {
        sheetId: 'dsht_5mk3yr8gme',
        identity: { songId: 'x', type: 'std', difficulty: 'basic' },
        achievementRate: 98,
        source: { provider: 'diving-fish', best50Bucket: 'b35' },
      },
    ] as PlayEntry[])
    expect(repository.list().map((r) => r.best50Bucket)).toEqual([null, 'b35'])
  })

  it('returns the collapsed record from get()', () => {
    const repository = LocalScoreRepository.inMemory(ENTRIES)
    expect(repository.get(SHEET)).toBe(repository.list()[0])
  })

  it('keeps every saved entry in the stored form', () => {
    expect(LocalScoreRepository.inMemory(ENTRIES).entries()).toHaveLength(ENTRIES.length)
  })
})