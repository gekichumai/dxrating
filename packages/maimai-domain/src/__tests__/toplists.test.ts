import { describe, expect, it } from 'vitest'
import {
  dxScoreStars,
  groupByTier,
  highestAchievements,
  maxDxScore,
  reachesTier,
  type ToplistRecord,
} from '../toplists'

const r = (
  sheetId: string,
  achievementRate: number,
  comboFlag?: ToplistRecord['comboFlag'],
  syncFlag?: ToplistRecord['syncFlag'],
): ToplistRecord => ({ sheetId, achievementRate, comboFlag, syncFlag })

describe('toplists', () => {
  const records = [r('a', 100.1, 'app', 'fsdp'), r('b', 100.8, 'ap'), r('c', 99, 'fc', 'fsd'), r('d', 101, null, 'fs')]
  it('reaches tiers inclusively', () => {
    expect(reachesTier(records[0]!, 'fc')).toBe(true)
    expect(reachesTier(records[2]!, 'fcp')).toBe(false)
    expect(reachesTier(records[3]!, 'fsd')).toBe(false)
  })
  it('groups by tier sorted by achievement', () => {
    const g = groupByTier(records)
    expect(g.app.map((x) => x.sheetId)).toEqual(['a'])
    expect(g.ap.map((x) => x.sheetId)).toEqual(['b', 'a'])
    expect(g.fc.map((x) => x.sheetId)).toEqual(['b', 'a', 'c'])
    expect(g.fsd.map((x) => x.sheetId)).toEqual(['a', 'c'])
  })
  it('sorts highest achievements', () => {
    expect(highestAchievements(records, 2).map((x) => x.sheetId)).toEqual(['d', 'b'])
  })
  it('computes dx stars', () => {
    expect(maxDxScore({ total: 100 })).toBe(300)
    expect(maxDxScore({})).toBeNull()
    expect(dxScoreStars(254, 300)).toBe(0)
    expect(dxScoreStars(255, 300)).toBe(1)
    expect(dxScoreStars(279, 300)).toBe(3)
    expect(dxScoreStars(291, 300)).toBe(5)
    expect(dxScoreStars(1, 0)).toBe(0)
  })
})