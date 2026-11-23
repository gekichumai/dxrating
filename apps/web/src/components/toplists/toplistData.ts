import {
  calculateRatingAward,
  type CollapsedPlay,
  dxScoreStars,
  maxDxScore,
  reachesTier,
  type ToplistTier,
  type VersionedSheet,
} from '@gekichumai/maimai-domain'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import type { ToplistKind } from '@/lib/analytics'

/** Tab order of /me/records */
export const TOPLIST_KINDS: readonly ToplistKind[] = ['ap', 'app', 'fc', 'fcp', 'fdx', 'fdxp', 'dx_score', 'highest']

export const TOPLIST_SORTS = ['achievement', 'rating', 'level', 'dx_score'] as const
export type ToplistSort = (typeof TOPLIST_SORTS)[number]

/** The highest-achievement tab is a top 50, like the B50 */
export const HIGHEST_LIMIT = 50

const TIER_OF_KIND: Partial<Record<ToplistKind, ToplistTier>> = {
  ap: 'ap',
  app: 'app',
  fc: 'fc',
  fcp: 'fcp',
  fdx: 'fsd',
  fdxp: 'fsdp',
}

export const isToplistKind = (value: unknown): value is ToplistKind =>
  typeof value === 'string' && (TOPLIST_KINDS as readonly string[]).includes(value)

export const isToplistSort = (value: unknown): value is ToplistSort =>
  typeof value === 'string' && (TOPLIST_SORTS as readonly string[]).includes(value)

export const defaultSortOf = (kind: ToplistKind): ToplistSort => (kind === 'dx_score' ? 'dx_score' : 'achievement')

export interface ToplistInputRecord {
  best: CollapsedPlay
  sheet: VersionedSheet | null
}

export interface ToplistRow {
  best: CollapsedPlay
  sheet: VersionedSheet
  rating: number | null
  dxScore: number | null
  dxScoreMax: number | null
  dxStars: number
}

export function toToplistRow({ best, sheet }: ToplistInputRecord): ToplistRow | null {
  if (!sheet) return null
  const dxScoreMax = maxDxScore(sheet.noteCounts)
  return {
    best,
    sheet,
    rating: sheet.isRatingEligible
      ? calculateRatingAward(sheet.internalLevelValue, best.achievementRate, best.comboFlag).ratingAwardValue
      : null,
    dxScore: best.dxScore,
    dxScoreMax,
    dxStars: best.dxScore !== null && dxScoreMax ? dxScoreStars(best.dxScore, dxScoreMax) : 0,
  }
}

const SORTERS: Record<ToplistSort, (a: ToplistRow, b: ToplistRow) => number> = {
  achievement: (a, b) => b.best.achievementRate - a.best.achievementRate,
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
  level: (a, b) => b.sheet.internalLevelValue - a.sheet.internalLevelValue,
  dx_score: (a, b) =>
    (b.dxScoreMax && b.dxScore !== null ? b.dxScore / b.dxScoreMax : -1) -
    (a.dxScoreMax && a.dxScore !== null ? a.dxScore / a.dxScoreMax : -1),
}

/** Ties fall back to achievement, then internal level, so the order is stable */
const compareRows = (sort: ToplistSort) => (a: ToplistRow, b: ToplistRow) =>
  SORTERS[sort](a, b) || SORTERS.achievement(a, b) || SORTERS.level(a, b) || a.sheet.id.localeCompare(b.sheet.id)

function matchesKind(row: ToplistRow, kind: ToplistKind): boolean {
  const tier = TIER_OF_KIND[kind]
  if (tier) return reachesTier({ ...row.best, sheetId: row.sheet.id }, tier)
  if (kind === 'dx_score') return row.dxScore !== null
  return true
}

/** Distinct display levels of the rows, hardest first (`14+` before `14` before `13+`) */
export function levelsOf(rows: readonly ToplistRow[]): string[] {
  const levelValue = (level: string) => Number.parseFloat(level) + (level.endsWith('+') ? 0.5 : 0)
  return [...new Set(rows.map((row) => row.sheet.level))].sort((a, b) => levelValue(b) - levelValue(a))
}

export function buildToplist(
  rows: readonly ToplistRow[],
  { kind, sort, level }: { kind: ToplistKind; sort: ToplistSort; level?: string },
): ToplistRow[] {
  const filtered = rows.filter((row) => matchesKind(row, kind) && (!level || row.sheet.level === level))
  if (kind === 'highest') {
    // The top 50 is picked by achievement; the chosen sort only reorders it
    return [...filtered].sort(compareRows('achievement')).slice(0, HIGHEST_LIMIT).sort(compareRows(sort))
  }
  return [...filtered].sort(compareRows(sort))
}

/** Whether a record counts towards the AP50 view of /rating */
export const isAllPerfect = (entry: Pick<PlayEntry, 'comboFlag'>) =>
  entry.comboFlag === 'ap' || entry.comboFlag === 'app'