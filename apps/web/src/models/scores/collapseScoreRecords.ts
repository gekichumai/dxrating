import { comboFlagRank, syncFlagRank } from '@gekichumai/maimai-domain'
import type { ScoreRecord } from './ScoreRepository'

/**
 * One record of a chart from two records of it, each field at its best independently, as the rating calculator
 * (`/rating`) reads duplicates: a lower score can carry the AP or the FDX.
 *
 * - `achievement` (and its display `achievementRate`): the higher
 * - `comboFlag`: the stronger (none < fc < fcp < ap < app)
 * - `syncFlag`: the stronger (none < sync < fs < fsp < fsd < fsdp)
 * - `dxScore`: the higher; a missing DX score never wins over a known one
 * - `best50Bucket`: the provider hint of the record with the higher achievement; on equal achievements `b15`.
 *   Records without a hint are ignored. `calculateBest50` picks conflicting hints by `preferBest50Hint`
 *   (packages/maimai-domain/src/best50.ts on the bot parity branch): the higher rating, then the higher achievement,
 *   then b15. The rating of one chart only grows with the achievement, so ranking by achievement picks the same
 *   hint without the catalog (the internal level) this needs.
 * - `identity` and `provenance`: those of `a`, the record seen first
 */
export function collapseScoreRecords(a: ScoreRecord, b: ScoreRecord): ScoreRecord {
  const higher = b.achievement > a.achievement ? b : a
  return {
    sheetId: a.sheetId,
    identity: a.identity,
    achievement: higher.achievement,
    achievementRate: higher.achievementRate,
    comboFlag: comboFlagRank(b.comboFlag) > comboFlagRank(a.comboFlag) ? b.comboFlag : a.comboFlag,
    syncFlag: syncFlagRank(b.syncFlag) > syncFlagRank(a.syncFlag) ? b.syncFlag : a.syncFlag,
    dxScore: a.dxScore === null ? b.dxScore : b.dxScore === null ? a.dxScore : Math.max(a.dxScore, b.dxScore),
    best50Bucket: preferredBucket(a, b),
    provenance: a.provenance,
  }
}

function preferredBucket(a: ScoreRecord, b: ScoreRecord): ScoreRecord['best50Bucket'] {
  if (a.best50Bucket === null) return b.best50Bucket
  if (b.best50Bucket === null) return a.best50Bucket
  if (a.achievement !== b.achievement) return b.achievement > a.achievement ? b.best50Bucket : a.best50Bucket
  return a.best50Bucket === 'b15' || b.best50Bucket === 'b15' ? 'b15' : a.best50Bucket
}

/** One record per chart, in the order each chart first appears, duplicates collapsed by {@link collapseScoreRecords} */
export function collapseScoreRecordList(records: Iterable<ScoreRecord>): Map<string, ScoreRecord> {
  const bySheetId = new Map<string, ScoreRecord>()
  for (const record of records) {
    const existing = bySheetId.get(record.sheetId)
    bySheetId.set(record.sheetId, existing ? collapseScoreRecords(existing, record) : record)
  }
  return bySheetId
}