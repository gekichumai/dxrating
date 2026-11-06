import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { validateToplistSearch } from '@/routes/me/records'
import { buildToplist, HIGHEST_LIMIT, isAllPerfect, levelsOf, readDxScore, toToplistRow } from './toplistData'

const sheet = (id: string, level: string, internalLevelValue: number) =>
  ({
    id,
    level,
    internalLevelValue,
    isRatingEligible: true,
    noteCounts: { total: 500 },
  }) as unknown as VersionedSheet

const row = (id: string, achievementRate: number, extra: Partial<PlayEntry> = {}, level = '13', value = 13.2) =>
  toToplistRow({
    entry: { sheetId: id, achievementRate, ...extra } as PlayEntry,
    sheet: sheet(id, level, value),
  })!

describe('toplist data', () => {
  const rows = [
    row('a', 100.8, { comboFlag: 'app', syncFlag: 'fsdp' }, '14+', 14.8),
    row('b', 100.6, { comboFlag: 'ap' }, '14', 14.2),
    row('c', 100.2, { comboFlag: 'fcp', syncFlag: 'fsd' }, '13+', 13.7),
    row('d', 99.0, { comboFlag: 'fc' }),
    row('e', 98.0),
  ]

  it('counts better results towards lower tiers', () => {
    expect(buildToplist(rows, { kind: 'ap', sort: 'achievement' }).map((r) => r.sheet.id)).toEqual(['a', 'b'])
    expect(buildToplist(rows, { kind: 'app', sort: 'achievement' }).map((r) => r.sheet.id)).toEqual(['a'])
    expect(buildToplist(rows, { kind: 'fc', sort: 'achievement' })).toHaveLength(4)
    expect(buildToplist(rows, { kind: 'fdx', sort: 'achievement' }).map((r) => r.sheet.id)).toEqual(['a', 'c'])
    expect(buildToplist(rows, { kind: 'fdxp', sort: 'achievement' }).map((r) => r.sheet.id)).toEqual(['a'])
  })

  it('sorts and filters by level', () => {
    expect(buildToplist(rows, { kind: 'highest', sort: 'level' })[0]!.sheet.id).toBe('a')
    expect(buildToplist(rows, { kind: 'highest', sort: 'achievement', level: '13' }).map((r) => r.sheet.id)).toEqual([
      'd',
      'e',
    ])
    expect(levelsOf(rows)).toEqual(['14+', '14', '13+', '13'])
  })

  it('limits the highest list to a top 50 by achievement', () => {
    const many = Array.from({ length: 60 }, (_, i) => row(`s${i}`, 90 + i / 10))
    const top = buildToplist(many, { kind: 'highest', sort: 'level' })
    expect(top).toHaveLength(HIGHEST_LIMIT)
    expect(top.some((r) => r.sheet.id === 's0')).toBe(false)
  })

  it('reads DX scores only when a record carries one', () => {
    expect(readDxScore({ sheetId: 'x', achievementRate: 100 } as PlayEntry)).toBeNull()
    const scored = toToplistRow({
      entry: { sheetId: 'x', achievementRate: 100, dxScore: 1460 } as PlayEntry,
      sheet: sheet('x', '13', 13),
    })!
    expect(scored.dxScoreMax).toBe(1500)
    expect(scored.dxStars).toBe(5)
    expect(buildToplist(rows, { kind: 'dx_score', sort: 'dx_score' })).toHaveLength(0)
    expect(buildToplist([...rows, scored], { kind: 'dx_score', sort: 'dx_score' })).toHaveLength(1)
  })

  it('treats AP and AP+ as all perfect', () => {
    expect(isAllPerfect({ comboFlag: 'ap' })).toBe(true)
    expect(isAllPerfect({ comboFlag: 'fcp' })).toBe(false)
  })

  it('validates the search params', () => {
    expect(validateToplistSearch({ tab: 'app', sort: 'rating', level: '14+' })).toEqual({
      tab: 'app',
      sort: 'rating',
      level: '14+',
    })
    expect(validateToplistSearch({ tab: 'x', sort: 1, level: '<script>' })).toEqual({
      tab: undefined,
      sort: undefined,
      level: undefined,
    })
  })
})