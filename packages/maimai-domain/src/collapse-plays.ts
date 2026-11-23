import { calculateRatingAward, chooseAuthoritativeBest50Hint, type AuthoritativeBest50Hint } from './best50.ts'
import { comboFlagRank, syncFlagRank } from './score-merge.ts'
import type { Best50Bucket, ComboFlag, SyncFlag } from './types'

/** One play of a chart, with its own best 50 hint (`best50HintOf` for a stored play) */
export interface ChartPlay {
  achievementRate: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
  dxScore?: number | null
  best50Bucket: Best50Bucket | null
}

declare const useCollapsePlays: unique symbol

/** A chart's record from every play of it (`collapsePlays`) */
export type CollapsedPlay = {
  readonly achievementRate: number
  readonly comboFlag: ComboFlag
  readonly syncFlag: SyncFlag
  readonly dxScore: number | null
  readonly best50Bucket: Best50Bucket | null
  readonly [useCollapsePlays]: true
}

/**
 * A chart's record from all its plays, as the game keeps it: achievement, combo, sync and DX score each at their best,
 * whichever play reached it, so a lower score keeps its AP or FDX. The best 50 hint is the one `calculateBest50` keeps
 * (`chooseAuthoritativeBest50Hint`), ranked by the play that carries it; with the internal level unknown, by
 * achievement, then AP, then b15. The order of the plays never changes the result.
 */
export function collapsePlays(
  plays: readonly [ChartPlay, ...ChartPlay[]],
  internalLevel: number | null,
): CollapsedPlay {
  let achievementRate = plays[0].achievementRate
  let comboFlag: ComboFlag = null
  let syncFlag: SyncFlag = null
  let dxScore: number | null = null
  let hint: RankedHint | null = null
  for (const play of plays) {
    achievementRate = Math.max(achievementRate, play.achievementRate)
    if (comboFlagRank(play.comboFlag) > comboFlagRank(comboFlag)) comboFlag = play.comboFlag ?? null
    if (syncFlagRank(play.syncFlag) > syncFlagRank(syncFlag)) syncFlag = play.syncFlag ?? null
    if (typeof play.dxScore === 'number' && (dxScore === null || play.dxScore > dxScore)) dxScore = play.dxScore
    hint = preferHint(hint, rankedHint(play, internalLevel))
  }
  return { achievementRate, comboFlag, syncFlag, dxScore, best50Bucket: hint?.bucket ?? null } as CollapsedPlay
}

/** Each chart's plays, in input order, and its record (`collapsePlays`); charts in order of first appearance */
export function collapsePlaysBySheet<T extends { sheetId: string }>(
  plays: Iterable<T>,
  chartPlay: (play: T) => ChartPlay,
  internalLevelOf: (sheetId: string) => number | null | undefined,
): Map<string, { plays: [T, ...T[]]; best: CollapsedPlay }> {
  const bySheetId = new Map<string, [T, ...T[]]>()
  for (const play of plays) {
    const existing = bySheetId.get(play.sheetId)
    if (existing) existing.push(play)
    else bySheetId.set(play.sheetId, [play])
  }
  const collapsed = new Map<string, { plays: [T, ...T[]]; best: CollapsedPlay }>()
  for (const [sheetId, sheetPlays] of bySheetId) {
    const [first, ...rest] = sheetPlays
    const best = collapsePlays([chartPlay(first), ...rest.map(chartPlay)], internalLevelOf(sheetId) ?? null)
    collapsed.set(sheetId, { plays: sheetPlays, best })
  }
  return collapsed
}

interface RankedHint {
  bucket: Best50Bucket
  play: ChartPlay
  domainHint: AuthoritativeBest50Hint | null
}

function rankedHint(play: ChartPlay, internalLevel: number | null): RankedHint | null {
  if (play.best50Bucket === null) return null
  return {
    bucket: play.best50Bucket,
    play,
    domainHint:
      internalLevel === null
        ? null
        : {
            bucket: play.best50Bucket,
            rating: calculateRatingAward(internalLevel, play.achievementRate, play.comboFlag),
            achievementRate: play.achievementRate,
          },
  }
}

function preferHint(a: RankedHint | null, b: RankedHint | null): RankedHint | null {
  if (!a) return b
  if (!b) return a
  if (a.domainHint && b.domainHint) {
    return chooseAuthoritativeBest50Hint(a.domainHint, b.domainHint) === b.domainHint ? b : a
  }
  const achievementDelta = b.play.achievementRate - a.play.achievementRate
  if (achievementDelta !== 0) return achievementDelta > 0 ? b : a
  const apDelta = Number(isAllPerfect(b.play.comboFlag)) - Number(isAllPerfect(a.play.comboFlag))
  if (apDelta !== 0) return apDelta > 0 ? b : a
  return b.bucket === 'b15' ? b : a
}

function isAllPerfect(comboFlag: ComboFlag | undefined): boolean {
  return comboFlag === 'ap' || comboFlag === 'app'
}