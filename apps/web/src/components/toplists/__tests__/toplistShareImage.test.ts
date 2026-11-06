import { describe, expect, it } from 'vitest'
import { toplistCardDetail } from '../toplistShareImage'

const row = (difficulty: string, comboFlag: 'ap' | null) =>
  ({ sheet: { type: 'std', difficulty, internalLevelValue: 12.7 }, entry: { comboFlag } }) as never

describe('toplistCardDetail', () => {
  it('tells apart same-level charts of one song by difficulty', () => {
    // City Escape: Act1 has STD MASTER and Re:MASTER at 12.7
    expect(toplistCardDetail(row('master', null))).toBe('STD MAS 12.7')
    expect(toplistCardDetail(row('remaster', 'ap'))).toBe('STD Re:MAS 12.7 AP')
  })
})