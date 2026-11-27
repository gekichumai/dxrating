import { DifficultyEnum } from '@gekichumai/dxdata'
import { ACHIEVEMENT_INT_MAX } from './achievement.ts'
import type { SongCatalog } from './song-catalog'
import type { VersionedSheet } from './types'

/**
 * Hard consistency rules for an imported score (gekichumai/meta#82). A record that breaks one of them cannot come
 * from a real play, so imports reject it (never clamp it) and say which rules it broke.
 *
 * A stored record is the best of each field on its own: the best achievement, the best combo, the best sync and the
 * best DX score may come from different plays. So only implications that hold across plays are rules here:
 * - AP+ does **not** imply the maximum DX score (a non-critical PERFECT on a tap still gives 101%). Only the maximum
 *   DX score implies AP+ and 101% (R4).
 * - The DX rules (R3, R4, R7) need the chart's note count, and some region charts have counts that differ from
 *   dxdata. They only run when the caller knows the maximum DX score of the chart the player played
 *   ({@link ScoreValidationChart.maxDxScore}); otherwise they are skipped.
 */
export const SCORE_VALIDATION_RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'] as const
export type ScoreValidationRule = (typeof SCORE_VALIDATION_RULES)[number]

/** What each rule checks, for logs and developer messages (user-facing text lives in the web's messages) */
export const SCORE_VALIDATION_RULE_DESCRIPTIONS: Readonly<Record<ScoreValidationRule, string>> = {
  R1: 'achievement above 101% (202% on UTAGE)',
  R2: 'unknown combo, sync or difficulty value',
  R3: 'DX score above the chart maximum',
  R4: 'maximum DX score without AP+ and 101%',
  R5: 'AP+ below 101%',
  R6: 'AP below 100.5%',
  R7: 'AP or AP+ with a DX score below 2 per note',
  R8: 'a score with a play count of 0',
}

/** UTAGE charts (2P ones in particular) reach 202% */
export const UTAGE_ACHIEVEMENT_INT_MAX = 2 * ACHIEVEMENT_INT_MAX
/** 100.5000%: an AP gives at least the full base score plus half of the break bonus */
export const AP_ACHIEVEMENT_INT_MIN = 1005000

const COMBO_VALUES: ReadonlySet<unknown> = new Set(['fc', 'fcp', 'ap', 'app'])
const SYNC_VALUES: ReadonlySet<unknown> = new Set(['fs', 'fsp', 'fsd', 'fsdp', 'sync'])
const DIFFICULTY_VALUES: ReadonlySet<unknown> = new Set(Object.values(DifficultyEnum))

/** The values of one record, as the source gave them */
export interface ScoreValidationInput {
  /** Integer achievement in 1/10000 % (`101.0000%` → `1010000`) */
  achievement: number
  /**
   * `fc` | `fcp` | `ap` | `app`, or `null` / `undefined` for none. Pass the source's value when it is not one of
   * these (an unknown string or status number), so R2 catches it instead of the normalizer silently dropping it.
   */
  comboFlag?: unknown
  /** `fs` | `fsp` | `fsd` | `fsdp` | `sync`, or `null` / `undefined` for none; unknown values as for `comboFlag` */
  syncFlag?: unknown
  /** Checked only when given: a standard difficulty, or a `【…】` label on a UTAGE chart */
  difficulty?: unknown
  dxScore?: number | null
  /** Only some sources give one; R8 is skipped without it */
  playCount?: number | null
}

/** What the validator knows about the chart the record is for */
export interface ScoreValidationChart {
  isUtage: boolean
  /**
   * 3 × the total note count of the chart as the player's region has it, or `null` when unknown or uncertain (no note
   * count, an ambiguous internal ID, a region whose chart may differ): R3, R4 and R7 are then skipped.
   */
  maxDxScore: number | null
}

/** The rules a record breaks, in rule order; empty when it is possible */
export function validateScore(input: ScoreValidationInput, chart: ScoreValidationChart): ScoreValidationRule[] {
  const broken: ScoreValidationRule[] = []
  const { achievement } = input
  const combo = input.comboFlag ?? null
  const sync = input.syncFlag ?? null
  const dxScore = typeof input.dxScore === 'number' ? input.dxScore : null
  const knownCombo = combo === null || COMBO_VALUES.has(combo)

  if (achievement > (chart.isUtage ? UTAGE_ACHIEVEMENT_INT_MAX : ACHIEVEMENT_INT_MAX)) broken.push('R1')

  const knownDifficulty =
    input.difficulty === undefined ||
    DIFFICULTY_VALUES.has(input.difficulty) ||
    (chart.isUtage && typeof input.difficulty === 'string' && /^【.+】$/.test(input.difficulty))
  if (!knownCombo || !(sync === null || SYNC_VALUES.has(sync)) || !knownDifficulty) broken.push('R2')

  // UTAGE scores add up over two players and follow no single-chart arithmetic: only R1 and R2 apply to them
  const max = chart.isUtage ? null : chart.maxDxScore
  if (max !== null && max > 0 && dxScore !== null) {
    if (dxScore > max) broken.push('R3')
    if (dxScore === max && (combo !== 'app' || achievement !== ACHIEVEMENT_INT_MAX)) broken.push('R4')
  }

  if (!chart.isUtage) {
    if (combo === 'app' && achievement < ACHIEVEMENT_INT_MAX) broken.push('R5')
    if (combo === 'ap' && achievement < AP_ACHIEVEMENT_INT_MIN) broken.push('R6')
    // 2 per note is a PERFECT's DX score: `dxScore < 2N` is `3 × dxScore < 2 × max`, in integers
    if (max !== null && max > 0 && dxScore !== null && (combo === 'ap' || combo === 'app') && 3 * dxScore < 2 * max) {
      broken.push('R7')
    }
  }

  if (input.playCount === 0 && (achievement > 0 || (dxScore ?? 0) > 0 || combo !== null || sync !== null)) {
    broken.push('R8')
  }
  return broken
}

const ambiguousIdsCache = new WeakMap<readonly VersionedSheet[], ReadonlySet<number>>()

/**
 * Internal IDs that do not name one chart family: shared by sheets of different songs, or by both STD and DX sheets
 * (STD IDs are below 10000 and DX IDs 10000 and up, so one ID on both is a data error). A record resolved to such a
 * sheet may be for another chart with another note count (dxdata's 360, for one).
 */
export function ambiguousInternalIds(catalog: Pick<SongCatalog, 'sheets'>): ReadonlySet<number> {
  let cached = ambiguousIdsCache.get(catalog.sheets)
  if (cached) return cached
  const owners = new Map<number, { songId: string; type: string }>()
  const ambiguous = new Set<number>()
  for (const sheet of catalog.sheets) {
    if (sheet.internalId === undefined || sheet.isTypeUtage) continue
    const owner = owners.get(sheet.internalId)
    if (!owner) owners.set(sheet.internalId, { songId: sheet.songId, type: sheet.type })
    else if (owner.songId !== sheet.songId || owner.type !== sheet.type) ambiguous.add(sheet.internalId)
  }
  cached = ambiguous
  ambiguousIdsCache.set(catalog.sheets, cached)
  return cached
}

/**
 * Providers whose scores come from the CN servers, where many charts have other note counts than dxdata's (in the
 * 2025-06 CN dump, 198 of the 4,880 charts with at least 50 records had more than 0.2% of their records above 3 ×
 * dxdata's note count). Their records skip the DX rules (R3, R4, R7); R1, R2, R5, R6 and R8 still apply (owner,
 * meta#82).
 */
export const CN_SCORE_PROVIDERS: readonly string[] = ['lxns', 'diving-fish']

/** Whether dxdata's note counts may be trusted for a provider's records: not for the CN providers */
export function catalogNoteCountsApply(provider: string | null | undefined): boolean {
  return provider == null || !CN_SCORE_PROVIDERS.includes(provider)
}

/** `chart` without its maximum DX score for a CN provider ({@link CN_SCORE_PROVIDERS}) */
export function forProvider(chart: ScoreValidationChart, provider: string | null | undefined): ScoreValidationChart {
  return catalogNoteCountsApply(provider) ? chart : { ...chart, maxDxScore: null }
}

/**
 * The validation context of a catalog sheet. The maximum DX score is 3 × dxdata's `noteCounts.total`, unless the
 * sheet is UTAGE, has no total, or has an ambiguous internal ID ({@link ambiguousInternalIds}). A source that shows
 * the chart's own maximum (maimai NET's `achieved / total`) passes it as `sourceMaxDxScore`, which wins: it is the
 * chart the player's region has.
 */
export function scoreValidationChartOf(
  catalog: Pick<SongCatalog, 'sheets'>,
  sheet: Pick<VersionedSheet, 'isTypeUtage' | 'internalId' | 'noteCounts'>,
  sourceMaxDxScore?: number | null,
): ScoreValidationChart {
  if (sheet.isTypeUtage) return { isUtage: true, maxDxScore: null }
  if (typeof sourceMaxDxScore === 'number' && Number.isSafeInteger(sourceMaxDxScore) && sourceMaxDxScore > 0) {
    return { isUtage: false, maxDxScore: sourceMaxDxScore }
  }
  const total = sheet.noteCounts?.total
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total <= 0) {
    return { isUtage: false, maxDxScore: null }
  }
  if (sheet.internalId !== undefined && ambiguousInternalIds(catalog).has(sheet.internalId)) {
    return { isUtage: false, maxDxScore: null }
  }
  return { isUtage: false, maxDxScore: 3 * total }
}