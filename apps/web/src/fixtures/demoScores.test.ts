import { describe, expect, it } from 'vitest'
import { buildDemoScores, isDemoScoresEnabled } from './demoScores'

describe('isDemoScoresEnabled', () => {
  it('only works off the production host', () => {
    expect(isDemoScoresEnabled('http://localhost:5173/rating?demoScores=1')).toBe(true)
    expect(isDemoScoresEnabled('https://pr-1.dxrating.workers.dev/?demoScores=1')).toBe(true)
    expect(isDemoScoresEnabled('https://dxrating.net/?demoScores=1')).toBe(false)
    expect(isDemoScoresEnabled('https://www.dxrating.net/?demoScores=1')).toBe(false)
    expect(isDemoScoresEnabled('capacitor://localhost/?demoScores=1')).toBe(false)
    expect(isDemoScoresEnabled('http://localhost:5173/rating')).toBe(false)
  })
})

describe('buildDemoScores', () => {
  const sheets = Array.from({ length: 400 }, (_, i) => ({
    id: `dsht_${i}`,
    identity: { songId: `dsng_${i}`, type: 'dx' as const, difficulty: 'master' as const },
    internalLevelValue: 10 + (i % 50) / 10,
    isRatingEligible: i % 7 !== 0,
  }))
  it('is deterministic and only uses eligible sheets', () => {
    const a = buildDemoScores({ sheets } as never)
    expect(a).toEqual(buildDemoScores({ sheets } as never))
    expect(a.length).toBeGreaterThan(30)
    expect(a.every((e) => Number(e.sheetId.slice(5)) % 7 !== 0)).toBe(true)
  })
})