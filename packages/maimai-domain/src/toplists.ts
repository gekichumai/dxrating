/** Top-list helpers: AP / FC / FDX groupings, highest achievements and DX score stars */
import type { NoteCounts } from '@gekichumai/dxdata'
import type { ComboFlag, SyncFlag } from './types'

export type ToplistTier = 'app' | 'ap' | 'fcp' | 'fc' | 'fsdp' | 'fsd'

export const TOPLIST_TIERS: readonly ToplistTier[] = ['app', 'ap', 'fcp', 'fc', 'fsdp', 'fsd']

export interface ToplistRecord {
  sheetId: string
  achievementRate: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
}

const COMBO_RANK: Record<NonNullable<ComboFlag>, number> = { fc: 1, fcp: 2, ap: 3, app: 4 }
const SYNC_RANK: Record<NonNullable<SyncFlag>, number> = { sync: 0, fs: 1, fsp: 2, fsd: 3, fsdp: 4 }

/** Whether a record reaches a tier (a better combo / sync counts too: an AP+ is also an AP and an FC) */
export function reachesTier(record: ToplistRecord, tier: ToplistTier): boolean {
  if (tier === 'fsd' || tier === 'fsdp') {
    return record.syncFlag ? SYNC_RANK[record.syncFlag] >= SYNC_RANK[tier] : false
  }
  return record.comboFlag ? COMBO_RANK[record.comboFlag] >= COMBO_RANK[tier] : false
}

function byAchievementDesc(a: ToplistRecord, b: ToplistRecord): number {
  return b.achievementRate - a.achievementRate
}

/** Records reaching each tier, best achievement first */
export function groupByTier<T extends ToplistRecord>(records: readonly T[]): Record<ToplistTier, T[]> {
  return Object.fromEntries(
    TOPLIST_TIERS.map((tier) => [tier, records.filter((record) => reachesTier(record, tier)).sort(byAchievementDesc)]),
  ) as Record<ToplistTier, T[]>
}

export function highestAchievements<T extends ToplistRecord>(records: readonly T[], limit = 50): T[] {
  return [...records].sort(byAchievementDesc).slice(0, limit)
}

/** Maximum DX score of a chart: 3 per note */
export function maxDxScore(noteCounts: NoteCounts | undefined): number | null {
  return noteCounts?.total ? noteCounts.total * 3 : null
}

/** In-game DX score star thresholds (share of the maximum): ✦1 85%, ✦2 90%, ✦3 93%, ✦4 95%, ✦5 97% */
export const DX_SCORE_STAR_THRESHOLDS = [0.85, 0.9, 0.93, 0.95, 0.97] as const

export function dxScoreStars(dxScore: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (max <= 0) return 0
  const ratio = dxScore / max
  return DX_SCORE_STAR_THRESHOLDS.filter((threshold) => ratio >= threshold).length as 0 | 1 | 2 | 3 | 4 | 5
}