import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { buildSongCatalog } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { calculateWebRatingEntries } from '@/components/rating/useRatingEntries'
import { groupUserRecords, toRatingEntries } from '@/models/userRecords'
import { computeRecommendations } from '../RecommendPage'

const version = 'PRiSM' as never
const catalog = buildSongCatalog(catalogSnapshot, version)

const run = (entries: PlayEntry[], region: 'jp' | 'cn') => {
  const records = [...groupUserRecords(entries, (id) => catalog.getById(id)).values()]
  const result = computeRecommendations({
    catalog,
    ratingEntries: toRatingEntries(entries, catalog),
    records,
    version,
    region,
  })
  const calculator = calculateWebRatingEntries({
    entries,
    sheets: catalog.sheets as never,
    catalog,
    appVersion: version,
    region,
  })
  return { result, calculator }
}

describe('computeRecommendations baseline parity with the calculator', () => {
  it('lets B50 pick a lower-achievement AP duplicate', () => {
    const sheet = catalog.sheets.find(
      (s) => s.isRatingEligible && s.internalLevelValue >= 13 && s.serverIds.includes('jp'),
    )!
    const { result, calculator } = run(
      [
        { sheetId: sheet.id, achievementRate: 100.5, comboFlag: 'ap' },
        { sheetId: sheet.id, achievementRate: 100.6, comboFlag: 'fc' },
      ],
      'jp',
    )
    expect(result.total).toBe(calculator.statistics.b50Sum)
  })

  it('keeps CN hints, also on a lower duplicate, with full buckets', () => {
    const cn = catalog.sheets.filter(
      (s) => s.isRatingEligible && s.serverIds.includes('cn') && s.difficulty === 'master',
    )
    const current = cn.filter((s) => s.version === 'PRiSM').slice(0, 20)
    const entries: PlayEntry[] = current.flatMap((s, i) => [
      { sheetId: s.id, achievementRate: 100.5 - i * 0.01 },
      { sheetId: s.id, achievementRate: 99, providerConfig: { divingFish: { ratingEligibility: 'b35' as const } } },
    ])
    const old = cn.filter((s) => s.version === 'FiNALE').slice(0, 40)
    entries.push(...old.map((s) => ({ sheetId: s.id, achievementRate: 100 })))
    const { result, calculator } = run(entries, 'cn')
    expect(result.total).toBe(calculator.statistics.b50Sum)
    expect(result.b35Floor).toBe(calculator.statistics.b35Min)
    expect(result.b15Floor).toBe(0)
  })
})