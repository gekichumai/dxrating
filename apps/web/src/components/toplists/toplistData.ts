import {
  calculateRatingAward,
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
  entry: PlayEntry
  sheet: VersionedSheet | null
}

export interface ToplistRow {
  entry: PlayEntry
  sheet: VersionedSheet
  rating: number | null
  dxScore: number | null
  dxScoreMax: number | null
  dxStars: number
}

/**
 * The DX score of a record. Saved records carry no DX score yet (the `PlayEntry` shape has none); a future cloud score
 * repository may add a `dxScore` field, which is read here without widening the record type.
 */
export function readDxScore(entry: PlayEntry): number | null {
  const value = (entry as PlayEntry & { dxScore?: unknown }).dxScore
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function toToplistRow({ entry, sheet }: ToplistInputRecord): ToplistRow | null {
  if (!sheet) return null
  const dxScore = readDxScore(entry)
  const dxScoreMax = maxDxScore(sheet.noteCounts)
  return {
    entry,
    sheet,
    rating: sheet.isRatingEligible
      ? calculateRatingAward(sheet.internalLevelValue, entry.achievementRate, entry.comboFlag).ratingAwardValue
      : null,
    dxScore,
    dxScoreMax,
    dxStars: dxScore !== null && dxScoreMax ? dxScoreStars(dxScore, dxScoreMax) : 0,
  }
}

const SORTERS: Record<ToplistSort, (a: ToplistRow, b: ToplistRow) => number> = {
  achievement: (a, b) => b.entry.achievementRate - a.entry.achievementRate,
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
  if (tier) return reachesTier({ ...row.entry, sheetId: row.sheet.id }, tier)
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