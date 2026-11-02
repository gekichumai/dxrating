import type { ComboFlag, SyncFlag } from '@gekichumai/maimai-domain'

/** Completion targets of the constant-table overlay, in the order of the selector */
export const COMPLETION_TARGETS = ['s', 'ss', 'sss', 'sssp', 'fc', 'fcp', 'ap', 'app', 'fs', 'fsd', 'fsdp'] as const
export type CompletionTarget = (typeof COMPLETION_TARGETS)[number]
export const DEFAULT_COMPLETION_TARGET: CompletionTarget = 'sss'

export const COMPLETION_TARGET_LABELS: Record<CompletionTarget, string> = {
  s: 'S',
  ss: 'SS',
  sss: 'SSS',
  sssp: 'SSS+',
  fc: 'FC',
  fcp: 'FC+',
  ap: 'AP',
  app: 'AP+',
  fs: 'FS',
  fsd: 'FDX',
  fsdp: 'FDX+',
}

export const parseCompletionTarget = (value: unknown): CompletionTarget | null => {
  if (typeof value !== 'string') return null
  const normalized = value.toLowerCase().replace(/\+$/, 'p')
  return (COMPLETION_TARGETS as readonly string[]).includes(normalized) ? (normalized as CompletionTarget) : null
}

export interface CompletionRecord {
  achievementRate: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
}

const ACHIEVEMENT_TARGETS: Partial<Record<CompletionTarget, number>> = { s: 97, ss: 99, sss: 100, sssp: 100.5 }
const COMBO_RANK: Record<NonNullable<ComboFlag>, number> = { fc: 1, fcp: 2, ap: 3, app: 4 }
const SYNC_RANK: Record<NonNullable<SyncFlag>, number> = { sync: 0, fs: 1, fsp: 2, fsd: 3, fsdp: 4 }

/** Whether a record meets a target; a better result counts too (an AP is also an FC, an FDX also an FS) */
export function meetsTarget(record: CompletionRecord | undefined, target: CompletionTarget): boolean {
  if (!record) return false
  const achievement = ACHIEVEMENT_TARGETS[target]
  if (achievement !== undefined) return record.achievementRate >= achievement
  if (target === 'fc' || target === 'fcp' || target === 'ap' || target === 'app') {
    return record.comboFlag ? COMBO_RANK[record.comboFlag] >= COMBO_RANK[target] : false
  }
  const sync = target as 'fs' | 'fsd' | 'fsdp'
  return record.syncFlag ? SYNC_RANK[record.syncFlag] >= SYNC_RANK[sync] : false
}

const RANKS: [number, string][] = [
  [100.5, 'SSS+'],
  [100, 'SSS'],
  [99.5, 'SS+'],
  [99, 'SS'],
  [98, 'S+'],
  [97, 'S'],
  [94, 'AAA'],
  [90, 'AA'],
  [80, 'A'],
  [75, 'BBB'],
  [70, 'BB'],
  [60, 'B'],
  [50, 'C'],
]

export const achievementRankLabel = (achievementRate: number): string =>
  RANKS.find(([min]) => achievementRate >= min)?.[1] ?? 'D'

export const COMBO_LABELS: Record<NonNullable<ComboFlag>, string> = { fc: 'FC', fcp: 'FC+', ap: 'AP', app: 'AP+' }
export const SYNC_LABELS: Record<NonNullable<SyncFlag>, string> = {
  sync: 'SYNC',
  fs: 'FS',
  fsp: 'FS+',
  fsd: 'FDX',
  fsdp: 'FDX+',
}

export type CompletionStatus = 'done' | 'pending' | 'unplayed'

export const completionStatus = (record: CompletionRecord | undefined, target: CompletionTarget): CompletionStatus =>
  !record ? 'unplayed' : meetsTarget(record, target) ? 'done' : 'pending'

export interface CompletionSummary {
  total: number
  done: number
  pending: number
  unplayed: number
}

/** Done / played-but-not-done / unplayed counts of a set of sheets */
export function summarizeCompletion(
  sheetIds: readonly string[],
  records: ReadonlyMap<string, { entry: CompletionRecord }>,
  target: CompletionTarget,
): CompletionSummary {
  const summary: CompletionSummary = { total: sheetIds.length, done: 0, pending: 0, unplayed: 0 }
  for (const sheetId of sheetIds) summary[completionStatus(records.get(sheetId)?.entry, target)]++
  return summary
}