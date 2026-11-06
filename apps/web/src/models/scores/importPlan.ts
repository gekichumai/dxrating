import { comboFlagRank, syncFlagRank, type ComboFlag, type SyncFlag } from '@gekichumai/maimai-domain'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { nextEntriesForImport } from './LocalScoreRepository'
import type { ImportMeta } from './ScoreRepository'

/**
 * What a file or provider import would do to the save, before it is applied (meta#35). The preview compares the save
 * chart by chart, each chart's fields at their best across its entries, as the rating calculator reads duplicates
 * (`collapseScoreRecords`).
 */

/** A chart's best values in a set of entries */
export interface ChartScore {
  achievementRate: number
  comboFlag: ComboFlag | null
  syncFlag: SyncFlag | null
  dxScore: number | null
}

/**
 * - `added`: a chart the save does not have
 * - `improved`: at least one field higher, none lower
 * - `unchanged`: every field the same
 * - `lowered`: at least one field lower (achievement, combo, sync or DX score, a dropped DX score included), even when
 *   another is higher
 * - `removed`: a chart the import drops from the save (`replace` only)
 */
export type ImportChangeKind = 'added' | 'improved' | 'unchanged' | 'lowered' | 'removed'

export interface ImportChange {
  sheetId: string
  kind: ImportChangeKind
  before: ChartScore | null
  after: ChartScore | null
}

export type ImportChangeCounts = Record<ImportChangeKind, number>

export interface ImportPlan {
  meta: ImportMeta
  /** Entries in the import */
  importedCount: number
  /** The save before the import, as it was read for the preview */
  previousEntries: readonly PlayEntry[]
  /** The save the import leaves, the same `applyImport` writes */
  nextEntries: readonly PlayEntry[]
  counts: ImportChangeCounts
  /** Lowered and removed charts: what the visitor would lose. Removed first, then the largest achievement drop */
  risky: readonly ImportChange[]
}

const isScoredEntry = (entry: PlayEntry | null | undefined): entry is PlayEntry =>
  !!entry && typeof entry.sheetId === 'string' && Number.isFinite(entry.achievementRate)

const higherFlag = <T extends string>(a: T | null, b: T | null, rank: (flag: T | null) => number): T | null =>
  rank(b) > rank(a) ? b : a

const comboRank = (flag: ComboFlag | null) => comboFlagRank(flag)
const syncRank = (flag: SyncFlag | null) => syncFlagRank(flag)

/** One best score per chart, in the order each chart first appears */
export function summarizeEntries(entries: readonly PlayEntry[]): Map<string, ChartScore> {
  const charts = new Map<string, ChartScore>()
  for (const entry of entries) {
    if (!isScoredEntry(entry)) continue
    const score: ChartScore = {
      achievementRate: entry.achievementRate,
      comboFlag: entry.comboFlag ?? null,
      syncFlag: entry.syncFlag ?? null,
      dxScore: typeof entry.dxScore === 'number' ? entry.dxScore : null,
    }
    const existing = charts.get(entry.sheetId)
    if (!existing) {
      charts.set(entry.sheetId, score)
      continue
    }
    charts.set(entry.sheetId, {
      achievementRate: Math.max(existing.achievementRate, score.achievementRate),
      comboFlag: higherFlag(existing.comboFlag, score.comboFlag, comboRank),
      syncFlag: higherFlag(existing.syncFlag, score.syncFlag, syncRank),
      dxScore:
        existing.dxScore === null
          ? score.dxScore
          : score.dxScore === null
            ? existing.dxScore
            : Math.max(existing.dxScore, score.dxScore),
    })
  }
  return charts
}

const sign = (difference: number) => (difference > 0 ? 1 : difference < 0 ? -1 : 0)

/** How a chart's score changes from `before` to `after` */
export function classifyChange(before: ChartScore, after: ChartScore): 'improved' | 'unchanged' | 'lowered' {
  const differences = [
    sign(after.achievementRate - before.achievementRate),
    sign(comboRank(after.comboFlag) - comboRank(before.comboFlag)),
    sign(syncRank(after.syncFlag) - syncRank(before.syncFlag)),
    // A DX score the import drops is lost (the save is written as the import leaves it); one it adds is a gain
    before.dxScore === null
      ? after.dxScore === null
        ? 0
        : 1
      : after.dxScore === null
        ? -1
        : sign(after.dxScore - before.dxScore),
  ]
  if (differences.includes(-1)) return 'lowered'
  if (differences.includes(1)) return 'improved'
  return 'unchanged'
}

/** Compares two saves chart by chart */
export function diffEntries(
  previous: readonly PlayEntry[],
  next: readonly PlayEntry[],
): { counts: ImportChangeCounts; changes: ImportChange[] } {
  const before = summarizeEntries(previous)
  const after = summarizeEntries(next)
  const counts: ImportChangeCounts = { added: 0, improved: 0, unchanged: 0, lowered: 0, removed: 0 }
  const changes: ImportChange[] = []
  for (const [sheetId, score] of after) {
    const previousScore = before.get(sheetId)
    const kind = previousScore ? classifyChange(previousScore, score) : 'added'
    counts[kind] += 1
    changes.push({ sheetId, kind, before: previousScore ?? null, after: score })
  }
  for (const [sheetId, score] of before) {
    if (after.has(sheetId)) continue
    counts.removed += 1
    changes.push({ sheetId, kind: 'removed', before: score, after: null })
  }
  return { counts, changes }
}

const achievementDrop = (change: ImportChange) =>
  (change.before?.achievementRate ?? 0) - (change.after?.achievementRate ?? 0)

/** The preview of importing `imported` into the save `current` */
export function planImport(
  current: readonly PlayEntry[],
  imported: readonly PlayEntry[],
  meta: ImportMeta,
): ImportPlan {
  const nextEntries = nextEntriesForImport(current, imported, meta.mode)
  const { counts, changes } = diffEntries(current, nextEntries)
  const risky = changes
    .filter((change) => change.kind === 'removed' || change.kind === 'lowered')
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'removed' ? -1 : 1
      return achievementDrop(b) - achievementDrop(a)
    })
  return { meta, importedCount: imported.length, previousEntries: current, nextEntries, counts, risky }
}

/** Whether applying the plan would lower or remove a chart */
export const isRiskyPlan = (plan: ImportPlan): boolean => plan.risky.length > 0

/** Whether applying the plan would change any chart */
export const planChangesSave = (plan: ImportPlan): boolean =>
  plan.counts.added + plan.counts.improved + plan.counts.lowered + plan.counts.removed > 0