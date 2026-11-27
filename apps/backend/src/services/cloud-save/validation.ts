import {
  CLOUD_SAVE_MAX_LISTED_REJECTIONS,
  type ImportCountsDTO,
  type ImportRecordInput,
  type ImportRejectionDTO,
} from '@gekichumai/api-contract'
import {
  forProvider,
  isPublicSheetId,
  scoreValidationChartOf,
  validateScore,
  type ClientImportSource,
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
 * Online, one impossible record rejects that record only: the rest of the import is applied and nothing marks the
 * account. Account taint (dropping every record of an account with an impossible one) is for offline analysis only
 * (owner decision, meta#82).
 *
 * The DX rules R3, R4 and R7 run only for records from a provider whose charts have dxdata's note counts
 * (`DXDATA_NOTE_COUNT_PROVIDERS`: maimai NET, AquaDX, MuNET, Aqua SQLite; `forProvider`). The CN providers (LXNS,
 * Diving-Fish) skip them, as their note counts often differ from dxdata's, and so does an uploaded record whose origin
 * is unknown: it may be a CN score too. An uploaded record's provider is the one it claims (`claimedSource`), else
 * the upload's source.
 */

/** No catalog: only the rules that need no chart data run (saves hold no UTAGE, so the 101% cap applies) */
const UNKNOWN_CHART: ScoreValidationChart = { isUtage: false, maxDxScore: null }

/**
 * The rules an uploaded record breaks, checked against the catalog's chart for its sheet ID. Takes the item as sent,
 * so a value the import schema refuses (an achievement above 101%, an unknown combo flag) still gets its rule; a
 * record without a numeric achievement breaks no rule here (it is just malformed). `source` is the upload's: it is
 * the record's provider when the record claims none (an AquaDX file; a `legacy-local` or `dxrating-json` record
 * without a claim is of unknown origin, so it skips the DX rules).
 */
export function validateUploadedRecord(
  catalog: SongCatalog | null,
  item: Pick<ImportRecordInput, 'sheetId' | 'achievement' | 'comboFlag' | 'syncFlag' | 'dxScore' | 'claimedSource'>,
  source: ClientImportSource,
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
    catalog && sheet
      ? forProvider(
          scoreValidationChartOf(catalog, sheet),
          typeof item.claimedSource === 'string' ? item.claimedSource : source,
        )
      : UNKNOWN_CHART,
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

type StoredCounts = Partial<ImportCountsDTO> | Record<string, unknown> | null | undefined

/**
 * The rejections a job row keeps in its `counts` column, next to the counts (internal like `chunks`, read back into
 * the job DTO by `toImportJobDTO`): the first {@link CLOUD_SAVE_MAX_LISTED_REJECTIONS}
 */
export function storedRejections(counts: StoredCounts): ImportRejectionDTO[] {
  const stored = (counts as { rejections?: unknown } | null | undefined)?.rejections
  if (!Array.isArray(stored)) return []
  return stored
    .filter(
      (entry): entry is ImportRejectionDTO =>
        typeof entry === 'object' && entry !== null && Array.isArray((entry as ImportRejectionDTO).rules),
    )
    .slice(0, CLOUD_SAVE_MAX_LISTED_REJECTIONS)
}

/**
 * How many impossible records the job rejected in all, kept as `rejectionsTotal` next to its listed `rejections`,
 * which stop at {@link CLOUD_SAVE_MAX_LISTED_REJECTIONS}. A job stored before the total was kept counts its list.
 */
export function storedRejectionsTotal(counts: StoredCounts): number {
  const listed = storedRejections(counts).length
  const stored = (counts as { rejectionsTotal?: unknown } | null | undefined)?.rejectionsTotal
  return typeof stored === 'number' && Number.isSafeInteger(stored) && stored >= listed ? stored : listed
}

/**
 * The rejection fields of a job row's `counts` column once `added` joins what `existing` (the column as an earlier
 * chunk left it, or nothing) already holds: the first {@link CLOUD_SAVE_MAX_LISTED_REJECTIONS} rejections and the
 * total. None when the job rejected nothing.
 */
export function rejectionFields(
  existing: StoredCounts,
  added: readonly ImportRejectionDTO[],
): { rejections?: ImportRejectionDTO[]; rejectionsTotal?: number } {
  const total = storedRejectionsTotal(existing) + added.length
  if (total === 0) return {}
  return {
    rejections: [...storedRejections(existing), ...added].slice(0, CLOUD_SAVE_MAX_LISTED_REJECTIONS),
    rejectionsTotal: total,
  }
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