import {
  CLOUD_SAVE_MAX_LISTED_REJECTIONS,
  type ImportCountsDTO,
  type ImportRecordInput,
  type ImportRejectionDTO,
} from '@gekichumai/api-contract'
import {
  isPublicSheetId,
  scoreValidationChartOf,
  validateScore,
  type ImportWarning,
  type ScoreValidationChart,
  type ScoreValidationRule,
  type SongCatalog,
} from '@gekichumai/maimai-domain'

/**
 * Import validation (gekichumai/meta#82): every import path rejects a record that breaks a hard rule of
 * `validateScore`, says which rules in the job's `rejections`, and never clamps it.
 *
 * - Server imports (maimai NET, LXNS, Diving-Fish) validate in the shared normalizers, which turn such a row into an
 *   `impossible-score` warning ({@link rejectionsOfWarnings}).
 * - Client uploads (`client-imports`, `replace`) are checked here against the published catalog
 *   ({@link validateUploadedRecord}): the client's own check is never trusted.
 *
 * TODO(meta#82): whole-import / whole-account taint is an open owner decision. Today one impossible record rejects
 * that record only; the rest of the import is applied and nothing marks the account. The owner's analysis drops
 * every record of a tainted account, so a later change may mark the job (or the account) tainted from its
 * `rejections`, and may need to refuse or quarantine the rest of the import. Decide before changing anything here.
 */

/** No catalog: only the rules that need no chart data run (saves hold no UTAGE, so the 101% cap applies) */
const UNKNOWN_CHART: ScoreValidationChart = { isUtage: false, maxDxScore: null }

/**
 * The rules an uploaded record breaks, checked against the catalog's chart for its sheet ID. Takes the item as sent,
 * so a value the import schema refuses (an achievement above 101%, an unknown combo flag) still gets its rule; a
 * record without a numeric achievement breaks no rule here (it is just malformed).
 */
export function validateUploadedRecord(
  catalog: SongCatalog | null,
  item: Pick<ImportRecordInput, 'sheetId' | 'achievement' | 'comboFlag' | 'syncFlag' | 'dxScore'>,
): ScoreValidationRule[] {
  if (typeof item.achievement !== 'number' || !Number.isFinite(item.achievement)) return []
  const sheet = catalog && typeof item.sheetId === 'string' ? catalog.getById(item.sheetId) : null
  return validateScore(
    {
      achievement: item.achievement,
      comboFlag: item.comboFlag,
      syncFlag: item.syncFlag,
      dxScore: typeof item.dxScore === 'number' ? item.dxScore : null,
    },
    catalog && sheet ? scoreValidationChartOf(catalog, sheet) : UNKNOWN_CHART,
  )
}

/** The rejection entry of an uploaded record */
export function uploadRejection(sheetId: unknown, rules: ScoreValidationRule[]): ImportRejectionDTO {
  return { sheetId: typeof sheetId === 'string' && isPublicSheetId(sheetId) ? sheetId : null, rules }
}

/** The rejections of a normalized server import: its `impossible-score` warnings */
export function rejectionsOfWarnings(warnings: readonly ImportWarning[]): ImportRejectionDTO[] {
  return warnings.flatMap((warning) =>
    warning.code === 'impossible-score' && warning.rules?.length
      ? [
          {
            sheetId: warning.sheetId && isPublicSheetId(warning.sheetId) ? warning.sheetId : null,
            rules: warning.rules,
          },
        ]
      : [],
  )
}

/** `existing` then `added`, at most {@link CLOUD_SAVE_MAX_LISTED_REJECTIONS} */
export function appendRejections(
  existing: readonly ImportRejectionDTO[],
  added: readonly ImportRejectionDTO[],
): ImportRejectionDTO[] {
  return [...existing, ...added].slice(0, CLOUD_SAVE_MAX_LISTED_REJECTIONS)
}

/**
 * The rejections a job row keeps in its `counts` column, next to the counts (internal like `chunks`, read back into
 * the job DTO by `toImportJobDTO`)
 */
export function storedRejections(counts: Partial<ImportCountsDTO> | Record<string, unknown> | null | undefined) {
  const stored = (counts as { rejections?: unknown } | null | undefined)?.rejections
  if (!Array.isArray(stored)) return []
  return stored
    .filter(
      (entry): entry is ImportRejectionDTO =>
        typeof entry === 'object' && entry !== null && Array.isArray((entry as ImportRejectionDTO).rules),
    )
    .slice(0, CLOUD_SAVE_MAX_LISTED_REJECTIONS)
}

/** Rejections by rule, for the per-job log line and metrics */
export function rejectionsByRule(
  rejections: readonly ImportRejectionDTO[],
): Partial<Record<ScoreValidationRule, number>> {
  const byRule: Partial<Record<ScoreValidationRule, number>> = {}
  for (const rejection of rejections) {
    for (const rule of rejection.rules) byRule[rule] = (byRule[rule] ?? 0) + 1
  }
  return byRule
}