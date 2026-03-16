import { describe, expect, it } from 'vitest'
import { calculateB50, calculateRating, type ComboFlag, type RatingEntry, SCORE_COEFFICIENT_TABLE } from '../rating'

describe('calculateRating', () => {
  describe('rank thresholds', () => {
    // Based on maimai DX rating formula: floor(coefficient × internalLevel × min(100.5, rate) / 100)
    // Reference: https://gamerch.com/maimai/533647

    it.each([
      { rate: 0, expectedRank: 'd', expectedCoeff: 0 },
      { rate: 10, expectedRank: 'd', expectedCoeff: 1.6 },
      { rate: 20, expectedRank: 'd', expectedCoeff: 3.2 },
      { rate: 30, expectedRank: 'd', expectedCoeff: 4.8 },
      { rate: 40, expectedRank: 'd', expectedCoeff: 6.4 },
      { rate: 50, expectedRank: 'c', expectedCoeff: 8 },
      { rate: 60, expectedRank: 'b', expectedCoeff: 9.6 },
      { rate: 70, expectedRank: 'bb', expectedCoeff: 11.2 },
      { rate: 75, expectedRank: 'bbb', expectedCoeff: 12.0 },
      { rate: 80, expectedRank: 'a', expectedCoeff: 13.6 },
      { rate: 90, expectedRank: 'aa', expectedCoeff: 15.2 },
      { rate: 94, expectedRank: 'aaa', expectedCoeff: 16.8 },
      { rate: 97, expectedRank: 's', expectedCoeff: 20 },
      { rate: 98, expectedRank: 'sp', expectedCoeff: 20.3 },
      { rate: 99, expectedRank: 'ss', expectedCoeff: 20.8 },
      { rate: 99.5, expectedRank: 'ssp', expectedCoeff: 21.1 },
      { rate: 100, expectedRank: 'sss', expectedCoeff: 21.6 },
      { rate: 100.5, expectedRank: 'sssp', expectedCoeff: 22.4 },
    ])(
      'achievement rate $rate → rank $expectedRank (coeff $expectedCoeff)',
      ({ rate, expectedRank, expectedCoeff }) => {
        const result = calculateRating(13.0, rate)
        expect(result.rank).toBe(expectedRank)
        expect(result.coefficient).toBe(expectedCoeff)
      },
    )
  })

  describe('formula: floor(coefficient × internalLevel × min(100.5, rate) / 100)', () => {
    it('calculates SSS+ for level 14.0 at 100.5%', () => {
      // floor(22.4 × 14.0 × 100.5 / 100) = floor(315.168) = 315
      const result = calculateRating(14.0, 100.5)
      expect(result.ratingAwardValue).toBe(315)
      expect(result.rank).toBe('sssp')
    })

    it('calculates SSS for level 13.0 at 100.4999%', () => {
      // floor(22.2 × 13.0 × 100.4999 / 100) = floor(290.04...) = 290
      const result = calculateRating(13.0, 100.4999)
      expect(result.ratingAwardValue).toBe(290)
      expect(result.rank).toBe('sss')
    })

    it('calculates S for level 12.5 at 97%', () => {
      // floor(20 × 12.5 × 97 / 100) = floor(242.5) = 242
      const result = calculateRating(12.5, 97)
      expect(result.ratingAwardValue).toBe(242)
      expect(result.rank).toBe('s')
    })

    it('calculates SS for level 13.7 at 99%', () => {
      // floor(20.8 × 13.7 × 99 / 100) = floor(282.14...) = 282
      const result = calculateRating(13.7, 99)
      expect(result.ratingAwardValue).toBe(282)
      expect(result.rank).toBe('ss')
    })

    it('calculates AAA for level 10.0 at 95%', () => {
      // floor(16.8 × 10.0 × 95 / 100) = floor(159.6) = 159
      const result = calculateRating(10.0, 95)
      expect(result.ratingAwardValue).toBe(159)
      expect(result.rank).toBe('aaa')
    })
  })

  describe('achievement rate capping at 100.5', () => {
    it('caps achievement rate at 100.5 even if higher', () => {
      // Even with rate=101, min(100.5, 101)=100.5
      // floor(22.4 × 13.0 × 100.5 / 100) = floor(292.656) = 292
      const at100_5 = calculateRating(13.0, 100.5)
      const at101 = calculateRating(13.0, 101)
      expect(at101.ratingAwardValue).toBe(at100_5.ratingAwardValue)
    })
  })

  describe('boundary conditions between ranks', () => {
    it('79.9999% is BBB, 80% is A', () => {
      const bbb = calculateRating(13.0, 79.9999)
      const a = calculateRating(13.0, 80)
      expect(bbb.rank).toBe('bbb')
      expect(a.rank).toBe('a')
      // coefficient jumps from 12.8 to 13.6
      expect(bbb.coefficient).toBe(12.8)
      expect(a.coefficient).toBe(13.6)
    })

    it('96.9999% is AAA, 97% is S', () => {
      const aaa = calculateRating(13.0, 96.9999)
      const s = calculateRating(13.0, 97)
      expect(aaa.rank).toBe('aaa')
      expect(s.rank).toBe('s')
      // coefficient jumps from 17.6 to 20
      expect(aaa.coefficient).toBe(17.6)
      expect(s.coefficient).toBe(20)
    })

    it('98.9999% is S+, 99% is SS', () => {
      const sp = calculateRating(13.0, 98.9999)
      const ss = calculateRating(13.0, 99)
      expect(sp.rank).toBe('sp')
      expect(ss.rank).toBe('ss')
    })

    it('99.9999% is SS+, 100% is SSS', () => {
      const ssp = calculateRating(13.0, 99.9999)
      const sss = calculateRating(13.0, 100)
      expect(ssp.rank).toBe('ssp')
      expect(sss.rank).toBe('sss')
    })

    it('100.4999% is SSS, 100.5% is SSS+', () => {
      const sss = calculateRating(13.0, 100.4999)
      const sssp = calculateRating(13.0, 100.5)
      expect(sss.rank).toBe('sss')
      expect(sssp.rank).toBe('sssp')
    })
  })

  describe('floor truncation', () => {
    it('always floors to integer', () => {
      // floor(22.4 × 13.5 × 100.5 / 100) = floor(303.912) = 303
      const result = calculateRating(13.5, 100.5)
      expect(result.ratingAwardValue).toBe(303)
      expect(Number.isInteger(result.ratingAwardValue)).toBe(true)
    })

    it('floors down, not rounds', () => {
      // floor(20 × 12.7 × 97 / 100) = floor(246.38) = 246
      const result = calculateRating(12.7, 97)
      expect(result.ratingAwardValue).toBe(246)
    })
  })

  describe('zero and low achievement rates', () => {
    it('returns 0 rating for 0% achievement', () => {
      const result = calculateRating(14.0, 0)
      expect(result.ratingAwardValue).toBe(0)
      expect(result.rank).toBe('d')
      expect(result.coefficient).toBe(0)
    })

    it('returns 0 rating for very low achievement with coeff 0', () => {
      const result = calculateRating(14.0, 5)
      expect(result.ratingAwardValue).toBe(0)
      expect(result.coefficient).toBe(0)
    })
  })

  describe('coefficient table is sorted', () => {
    it('achievement rate thresholds are monotonically increasing', () => {
      for (let i = 1; i < SCORE_COEFFICIENT_TABLE.length; i++) {
        expect(SCORE_COEFFICIENT_TABLE[i][0]).toBeGreaterThan(SCORE_COEFFICIENT_TABLE[i - 1][0])
      }
    })

    it('coefficients are monotonically increasing', () => {
      for (let i = 1; i < SCORE_COEFFICIENT_TABLE.length; i++) {
        expect(SCORE_COEFFICIENT_TABLE[i][1]).toBeGreaterThanOrEqual(SCORE_COEFFICIENT_TABLE[i - 1][1])
      }
    })
  })

  describe('known reference values', () => {
    // Cross-check with commonly known rating values from the community
    // Level 14.0 SSS+ → floor(22.4 × 14.0 × 100.5 / 100) = 315
    it('level 14.0 SSS+ = 315', () => {
      expect(calculateRating(14.0, 100.5).ratingAwardValue).toBe(315)
    })

    // Level 15.0 SSS+ → floor(22.4 × 15.0 × 100.5 / 100) = 337
    it('level 15.0 SSS+ = 337', () => {
      expect(calculateRating(15.0, 100.5).ratingAwardValue).toBe(337)
    })

    // Level 13.0 SSS+ → floor(22.4 × 13.0 × 100.5 / 100) = 292
    it('level 13.0 SSS+ = 292', () => {
      expect(calculateRating(13.0, 100.5).ratingAwardValue).toBe(292)
    })

    // Level 14.0 SS+ (99.5%) → floor(21.1 × 14.0 × 99.5 / 100) = 293
    it('level 14.0 SS+ at 99.5% = 293', () => {
      expect(calculateRating(14.0, 99.5).ratingAwardValue).toBe(293)
    })

    // Level 14.0 S (97%) → floor(20 × 14.0 × 97 / 100) = 271
    it('level 14.0 S at 97% = 271', () => {
      expect(calculateRating(14.0, 97).ratingAwardValue).toBe(271)
    })
  })
})

describe('AP/AP+ bonus', () => {
  it('AP grants +1 rating bonus', () => {
    const without = calculateRating(14.0, 100.5)
    const withAp = calculateRating(14.0, 100.5, 'ap')
    expect(withAp.ratingAwardValue).toBe(without.ratingAwardValue + 1)
  })

  it('AP+ grants +1 rating bonus', () => {
    const without = calculateRating(14.0, 100.5)
    const withApp = calculateRating(14.0, 100.5, 'app')
    expect(withApp.ratingAwardValue).toBe(without.ratingAwardValue + 1)
  })

  it.each([null, 'fc', 'fcp'] as ComboFlag[])('comboFlag %s does NOT grant bonus', (flag) => {
    const without = calculateRating(14.0, 100.5)
    const withFlag = calculateRating(14.0, 100.5, flag)
    expect(withFlag.ratingAwardValue).toBe(without.ratingAwardValue)
  })

  it('undefined comboFlag does NOT grant bonus', () => {
    const without = calculateRating(14.0, 100.5)
    const withUndefined = calculateRating(14.0, 100.5, undefined)
    expect(withUndefined.ratingAwardValue).toBe(without.ratingAwardValue)
  })

  it('AP bonus applies after floor truncation', () => {
    // floor(22.4 × 14.0 × 100.5 / 100) = floor(315.168) = 315, +1 = 316
    const result = calculateRating(14.0, 100.5, 'ap')
    expect(result.ratingAwardValue).toBe(316)
  })

  it('AP bonus applies even at 0% achievement', () => {
    const result = calculateRating(14.0, 0, 'ap')
    // base is 0, +1 = 1
    expect(result.ratingAwardValue).toBe(1)
  })
})

describe('calculateB50', () => {
  const currentVersionIds = new Set(['song-a', 'song-b', 'song-c'])

  function makeEntry(id: string, internalLevel: number, achievementRate: number): RatingEntry {
    return { id, internalLevel, achievementRate }
  }

  it('splits entries into b15 (current version) and b35 (older versions)', () => {
    const entries = [
      makeEntry('song-a', 14.0, 100.5), // current version
      makeEntry('song-b', 13.0, 100.5), // current version
      makeEntry('old-1', 14.0, 100.5), // old version
      makeEntry('old-2', 13.0, 100.5), // old version
    ]

    const result = calculateB50(currentVersionIds, entries)
    expect(result.b15).toHaveLength(2)
    expect(result.b35).toHaveLength(2)
    expect(result.b15.map((e) => e.id)).toEqual(['song-a', 'song-b'])
    expect(result.b35.map((e) => e.id)).toEqual(['old-1', 'old-2'])
  })

  it('limits b15 to 15 entries and b35 to 35 entries', () => {
    const entries: RatingEntry[] = []
    // 20 current version entries
    for (let i = 0; i < 20; i++) {
      entries.push(makeEntry(`current-${i}`, 13.0, 100.5))
    }
    // Add those ids to current version
    const ids = new Set(entries.map((e) => e.id))
    // 40 old version entries
    for (let i = 0; i < 40; i++) {
      entries.push(makeEntry(`old-${i}`, 13.0, 100.5))
    }

    const result = calculateB50(ids, entries)
    expect(result.b15).toHaveLength(15)
    expect(result.b35).toHaveLength(35)
  })

  it('sorts by rating descending', () => {
    const entries = [
      makeEntry('old-low', 10.0, 97), // low rating
      makeEntry('old-high', 14.0, 100.5), // high rating
      makeEntry('old-mid', 12.0, 99), // mid rating
    ]

    const result = calculateB50(currentVersionIds, entries)
    expect(result.b35[0].id).toBe('old-high')
    expect(result.b35[1].id).toBe('old-mid')
    expect(result.b35[2].id).toBe('old-low')
  })

  it('calculates total b50 rating as sum of b15 + b35', () => {
    const entries = [
      makeEntry('song-a', 14.0, 100.5), // b15: 315
      makeEntry('old-1', 13.0, 100.5), // b35: 292
    ]

    const result = calculateB50(currentVersionIds, entries)
    expect(result.b50Rating).toBe(315 + 292)
  })

  it('handles empty input', () => {
    const result = calculateB50(currentVersionIds, [])
    expect(result.b15).toHaveLength(0)
    expect(result.b35).toHaveLength(0)
    expect(result.b50Rating).toBe(0)
  })

  it('handles all entries in current version (no b35)', () => {
    const entries = [makeEntry('song-a', 14.0, 100.5), makeEntry('song-b', 13.0, 100.5)]

    const result = calculateB50(currentVersionIds, entries)
    expect(result.b15).toHaveLength(2)
    expect(result.b35).toHaveLength(0)
    expect(result.b50Rating).toBe(315 + 292)
  })

  it('handles no entries in current version (no b15)', () => {
    const entries = [makeEntry('old-1', 14.0, 100.5), makeEntry('old-2', 13.0, 100.5)]

    const result = calculateB50(new Set(), entries)
    expect(result.b15).toHaveLength(0)
    expect(result.b35).toHaveLength(2)
  })

  it('includes AP bonus in b50 rating total', () => {
    const entries: RatingEntry[] = [
      { id: 'song-a', internalLevel: 14.0, achievementRate: 100.5, comboFlag: 'ap' }, // b15: 315 + 1 = 316
      { id: 'old-1', internalLevel: 13.0, achievementRate: 100.5, comboFlag: 'app' }, // b35: 292 + 1 = 293
    ]

    const result = calculateB50(currentVersionIds, entries)
    expect(result.b50Rating).toBe(316 + 293)
  })
})