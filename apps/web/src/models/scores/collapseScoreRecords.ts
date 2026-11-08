import {
  calculateRatingAward,
  chooseAuthoritativeBest50Hint,
  comboFlagRank,
  syncFlagRank,
  type AuthoritativeBest50Hint,
  type Best50Bucket,
  type ComboFlag,
} from '@gekichumai/maimai-domain'
import type { ScoreRecord } from './ScoreRepository'

/** The internal level of a chart under the selected version, or nothing when the catalog does not know it */
export type InternalLevelResolver = (sheetId: string) => number | null | undefined

/** A record's own best 50 hint with the ranking data of the record that carries it */
export interface HintCandidate {
  bucket: Best50Bucket
  /** Integer in 1/10000 %, as `ScoreRecord.achievement` */
  achievement: number
  comboFlag: ComboFlag | null
  /** Only with a known internal level */
  domainHint: AuthoritativeBest50Hint | null
}

interface CollapsedRecord {
  /** Every field but `best50Bucket` aggregated; `best50Bucket` comes from `hint` */
  record: ScoreRecord
  /** `undefined` while the chart has a single record, which is kept as it is */
  hint?: HintCandidate | null
}

/**
 * One record of a chart from two records of it. See {@link collapseScoreRecordList}; `internalLevel` is the chart's,
 * or nothing when unknown.
 */
export function collapseScoreRecords(a: ScoreRecord, b: ScoreRecord, internalLevel?: number | null): ScoreRecord {
  return collapseScoreRecordList([a, b], () => internalLevel).get(a.sheetId)!
}

/**
 * One record per chart, in the order each chart first appears. Duplicates of a chart are collapsed with each field
 * at its best independently, as the rating calculator (`/rating`) reads duplicates: a lower score can carry the AP
 * or the FDX.
 *
 * - `achievement` (and its display `achievementRate`): the higher
 * - `comboFlag`: the stronger (none < fc < fcp < ap < app)
 * - `syncFlag`: the stronger (none < sync < fs < fsp < fsd < fsdp)
 * - `dxScore`: the higher; a missing DX score never wins over a known one
 * - `best50Bucket`: the hint `calculateBest50` keeps for the chart (`deduplicateEntries`): each hint is ranked by the
 *   record that carries it, not by the aggregated fields above, so the result does not depend on the input order.
 *   With the internal level known: by `chooseAuthoritativeBest50Hint` from maimai-domain, i.e. the higher rating
 *   (`calculateRatingAward`, AP bonus included), then the higher achievement, then b15. With the internal level
 *   unknown (catalog not loaded, chart missing from the selected version) the rating cannot be computed: the
 *   higher achievement, then an AP/APP, then b15. That order equals the domain's except where an AP lifts a lower
 *   achievement above a higher one by the one-point AP bonus. Records without a hint never win over one with.
 *   Only Diving-Fish hints reach a record (`playEntryToScoreRecord`), as only those count in `calculateBest50`
 *   (`hasAuthoritativeBucketHint`). The domain also requires the `cn` region; a record is region-independent, so
 *   it keeps the hint and `calculateBest50` decides per region whether it applies.
 * - `identity` and `provenance`: those of the record seen first
 */
export function collapseScoreRecordList(
  records: Iterable<ScoreRecord>,
  resolveInternalLevel?: InternalLevelResolver | null,
): Map<string, ScoreRecord> {
  const bySheetId = new Map<string, CollapsedRecord>()
  const internalLevels = new Map<string, number | null>()
  const internalLevelOf = (sheetId: string) => {
    if (!internalLevels.has(sheetId)) internalLevels.set(sheetId, resolveInternalLevel?.(sheetId) ?? null)
    return internalLevels.get(sheetId)!
  }

  for (const record of records) {
    const existing = bySheetId.get(record.sheetId)
    if (!existing) {
      bySheetId.set(record.sheetId, { record })
      continue
    }
    const internalLevel = internalLevelOf(record.sheetId)
    // The first record's own hint is taken only once a duplicate shows up; a single record stays as it is
    const existingHint = existing.hint === undefined ? hintOf(existing.record, internalLevel) : existing.hint
    bySheetId.set(record.sheetId, {
      record: mergeFields(existing.record, record),
      hint: preferHint(existingHint, hintOf(record, internalLevel)),
    })
  }

  const collapsed = new Map<string, ScoreRecord>()
  for (const [sheetId, { record, hint }] of bySheetId) {
    collapsed.set(sheetId, hint === undefined ? record : withBucket(record, hint))
  }
  return collapsed
}

function withBucket(record: ScoreRecord, hint: HintCandidate | null): ScoreRecord {
  const best50Bucket = hint?.bucket ?? null
  return record.best50Bucket === best50Bucket ? record : { ...record, best50Bucket }
}

function mergeFields(a: ScoreRecord, b: ScoreRecord): ScoreRecord {
  const higher = b.achievement > a.achievement ? b : a
  return {
    sheetId: a.sheetId,
    identity: a.identity,
    achievement: higher.achievement,
    achievementRate: higher.achievementRate,
    comboFlag: comboFlagRank(b.comboFlag) > comboFlagRank(a.comboFlag) ? b.comboFlag : a.comboFlag,
    syncFlag: syncFlagRank(b.syncFlag) > syncFlagRank(a.syncFlag) ? b.syncFlag : a.syncFlag,
    dxScore: a.dxScore === null ? b.dxScore : b.dxScore === null ? a.dxScore : Math.max(a.dxScore, b.dxScore),
    // Set from the winning hint once the chart is collapsed
    best50Bucket: null,
    provenance: a.provenance,
  }
}

function hintOf(record: ScoreRecord, internalLevel: number | null): HintCandidate | null {
  if (record.best50Bucket === null) return null
  return {
    bucket: record.best50Bucket,
    achievement: record.achievement,
    comboFlag: record.comboFlag,
    domainHint:
      internalLevel === null
        ? null
        : {
            bucket: record.best50Bucket,
            rating: calculateRatingAward(internalLevel, record.achievementRate, record.comboFlag),
            achievementRate: record.achievementRate,
          },
  }
}

/** The hint of two of a chart's records that `calculateBest50` keeps; see {@link collapseScoreRecordList} */
export function preferHint(a: HintCandidate | null, b: HintCandidate | null): HintCandidate | null {
  if (!a) return b
  if (!b) return a
  // Both records are of the same chart, so either both have a known internal level or neither has
  if (a.domainHint && b.domainHint) {
    return chooseAuthoritativeBest50Hint(a.domainHint, b.domainHint) === b.domainHint ? b : a
  }
  const achievementDelta = b.achievement - a.achievement
  if (achievementDelta !== 0) return achievementDelta > 0 ? b : a
  const apDelta = Number(isAllPerfect(b.comboFlag)) - Number(isAllPerfect(a.comboFlag))
  if (apDelta !== 0) return apDelta > 0 ? b : a
  return b.bucket === 'b15' ? b : a
}

function isAllPerfect(comboFlag: ComboFlag | null): boolean {
  return comboFlag === 'ap' || comboFlag === 'app'
}