import { collapsePlaysBySheet, fromAchievementInt, toAchievementInt } from '@gekichumai/maimai-domain'
import type { ScoreRecord } from './ScoreRepository'

/** The internal level of a chart under the selected version, or nothing when the catalog does not know it */
export type InternalLevelResolver = (sheetId: string) => number | null | undefined

/** One record of a chart from two records of it; see {@link collapseScoreRecordList} */
export function collapseScoreRecords(a: ScoreRecord, b: ScoreRecord, internalLevel?: number | null): ScoreRecord {
  return collapseScoreRecordList([a, b], () => internalLevel).get(a.sheetId)!
}

/**
 * One record per chart, in the order each chart first appears, with its fields as `collapsePlays` keeps them (the
 * integer achievement decides). A chart's single record is kept as it is; `identity` and `provenance` are those of the
 * record seen first.
 */
export function collapseScoreRecordList(
  records: Iterable<ScoreRecord>,
  resolveInternalLevel?: InternalLevelResolver | null,
): Map<string, ScoreRecord> {
  const collapsed = collapsePlaysBySheet(
    records,
    (record) => ({ ...record, achievementRate: fromAchievementInt(record.achievement) }),
    (sheetId) => resolveInternalLevel?.(sheetId),
  )
  const bySheetId = new Map<string, ScoreRecord>()
  for (const [sheetId, { plays, best }] of collapsed) {
    if (plays.length === 1) {
      bySheetId.set(sheetId, plays[0])
      continue
    }
    const achievement = toAchievementInt(best.achievementRate)!
    bySheetId.set(sheetId, {
      sheetId,
      identity: plays[0].identity,
      achievement,
      achievementRate: plays.find((record) => record.achievement === achievement)!.achievementRate,
      comboFlag: best.comboFlag,
      syncFlag: best.syncFlag,
      dxScore: best.dxScore,
      best50Bucket: best.best50Bucket,
      provenance: plays[0].provenance,
    })
  }
  return bySheetId
}