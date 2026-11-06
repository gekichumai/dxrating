import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { buildSongCatalog, getPlateCharts, getPlateVersionGroups } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { calculateWebRatingEntries } from '@/components/rating/useRatingEntries'
import { groupUserRecords, toRatingEntries } from '@/models/userRecords'
import { computeHomeQuickStats } from '../useHomeQuickStats'

const version = 'PRiSM' as never
const catalog = buildSongCatalog(catalogSnapshot, version)

describe('computeHomeQuickStats', () => {
  it('matches the calculator when CN Diving Fish hints disagree with the chart version', () => {
    const sheetIds = catalog.sheets
      .filter((s) => s.version === 'PRiSM' && s.difficulty === 'master' && s.serverIds.includes('cn'))
      .slice(0, 16)
      .map((s) => s.id)
    expect(sheetIds).toHaveLength(16)
    const entries: PlayEntry[] = sheetIds.map((sheetId) => ({
      sheetId,
      achievementRate: 100.5,
      providerConfig: { divingFish: { ratingEligibility: 'b35' } },
    }))
    const records = [...groupUserRecords(entries, (id) => catalog.getById(id)).values()]
    const stats = computeHomeQuickStats({
      records,
      ratingEntries: toRatingEntries(entries, catalog),
      isDemo: false,
      catalog,
      songs: catalogSnapshot.songs,
      version,
      region: 'cn',
    })!
    const calculator = calculateWebRatingEntries({
      entries,
      sheets: catalog.sheets as never,
      catalog,
      appVersion: version,
      region: 'cn',
    })
    expect(calculator.b35Entries).toHaveLength(16)
    expect(stats.rating).toBe(calculator.statistics.b50Sum)
    expect(stats.b35Floor).toBe(calculator.statistics.b35Min)
    expect(stats.b15Floor).toBeNull()
    // The nearest-plate link opens the server the progress was computed for
    expect(stats.nearestPlate?.region).toBe('cn')
  })
})

describe('getPlateCharts', () => {
  it('scans the catalog once per song list, group and region', () => {
    const group = getPlateVersionGroups('jp').find((g) => g.id === 'kagami')!
    const first = getPlateCharts(catalogSnapshot.songs, group, 'jp')
    expect(getPlateCharts(catalogSnapshot.songs, group, 'jp')).toBe(first)
    expect(getPlateCharts(catalogSnapshot.songs, group, 'intl')).not.toBe(first)
  })
})