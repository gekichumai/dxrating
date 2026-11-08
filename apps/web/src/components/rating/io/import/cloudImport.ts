import type { ImportJobDTO } from '@gekichumai/api-contract'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'
import { migrateLegacyImportEntries } from '@/catalog/savedDataMigration'
import { cloudImportConfirm } from '@/components/cloud-save/cloudImportConfirm'
import {
  clientImportPlan,
  entriesToImportRecords,
  ImportAlreadyRunningError,
  ImportTooLargeError,
  NothingToImportError,
} from '@/models/scores/cloudImports'
import { reviewAndApplyImport } from '@/models/scores/importReview'
import type {
  ImportMeta,
  ImportProgress,
  ImportResult,
  ScoreRepository,
  ServerImportArgs,
  ServerImportKind,
  WebScoreRepository,
} from '@/models/scores/ScoreRepository'
import { m } from '@/paraglide/messages'
import type { Locale } from '@/paraglide/runtime'

/**
 * How the import UI talks to the active save. The local save is unchanged: every importer calls `applyImport` as
 * before. A cloud save (design §8.3):
 * - `server`: maimai NET, LXNS and Diving-Fish run on the server (`runServerImport`); the browser never sees, let
 *   alone uploads, what they fetch;
 * - `client-fallback`: server imports are off for the user (§7.4). The browser fetches the old way and uploads to
 *   `client-imports`; those records are `client_reported`, never verified. This is the only case where a client
 *   uploads provider records.
 */
export type ImportPath = 'local' | 'server' | 'client-fallback'

export function importPath(repository: Pick<ScoreRepository, 'kind' | 'serverImportsEnabled'>): ImportPath {
  if (repository.kind !== 'cloud') return 'local'
  return repository.serverImportsEnabled === false ? 'client-fallback' : 'server'
}

/**
 * Imports entries read from a file. On a cloud save, entries of an old rating file move to public sheet IDs first,
 * then the user chooses to merge or to clear the save first (§5.3 rule 5); `null` when they cancel. The entries are
 * validated as the server will before asking: the dialog says how many will be left out, and a file none of whose
 * records can be imported throws `NothingToImportError` without asking, leaving the save as it was. On the local
 * save, the import preview, confirmation and undo snapshot of `reviewAndApplyImport` (meta#35); `null` when the
 * visitor cancels the preview.
 */
export async function importFileEntries(
  repository: WebScoreRepository,
  entries: PlayEntry[],
  meta: ImportMeta,
  migrate: (entries: PlayEntry[]) => Promise<PlayEntry[]> = migrateLegacyImportEntries,
): Promise<ImportResult | null> {
  if (repository.kind !== 'cloud') {
    const reviewed = await reviewAndApplyImport(repository, entries, meta, { trigger: 'manual' })
    return reviewed.applied ? (reviewed.result ?? { count: entries.length }) : null
  }
  const migrated = await migrate(entries)
  const plan = clientImportPlan(meta.source, repository.serverImportsEnabled !== false, meta.claimedSource)
  let importable = migrated.length
  let leftOut = 0
  if (plan) {
    const { records, skipped, rejected } = entriesToImportRecords(migrated, plan)
    if (records.length === 0 && migrated.length > 0) throw new NothingToImportError(skipped, rejected)
    importable = records.length
    leftOut = skipped + rejected
  }
  const choice = await cloudImportConfirm.request(importable, leftOut)
  if (!choice) return null
  return repository.applyImport(migrated, { ...meta, mode: choice })
}

/**
 * Provider records the browser fetched itself, on a cloud save with server imports off (the §7.4 fallback): merged,
 * never replacing the save. Uploaded as `client_reported`. The automatic maimai NET import passes `trigger: 'auto'`
 * and its key, so it never brings back what the user deleted and tabs in the same 15 minutes share one job (§5.3, §5.5).
 */
export function importFallbackEntries(
  repository: ScoreRepository,
  entries: PlayEntry[],
  source: ImportMeta['source'],
  options: Pick<ImportMeta, 'claimedSource' | 'trigger' | 'idempotencyKey'> = {},
): Promise<ImportResult> {
  return repository.applyImport(entries, { ...options, source, mode: 'merge' })
}

/** Runs a server import to its end, reporting progress; resolves the finished job */
export async function runServerImportToEnd<K extends ServerImportKind>(
  repository: ScoreRepository,
  kind: K,
  args: ServerImportArgs[K],
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportJobDTO> {
  let job: ImportJobDTO | undefined
  for await (const progress of repository.runServerImport(kind, args)) {
    onProgress?.(progress)
    if (progress.job) job = progress.job
  }
  if (!job) throw new Error('The import ended without a job')
  return job
}

/** The words of each count of an import job */
export const IMPORT_COUNT_MESSAGES = {
  inserted: m.ratingCalculator_cloudSave_history_counts_inserted,
  improved: m.ratingCalculator_cloudSave_history_counts_improved,
  provenanceUpgraded: m.ratingCalculator_cloudSave_history_counts_provenanceUpgraded,
  unchanged: m.ratingCalculator_cloudSave_history_counts_unchanged,
  keptUserEdit: m.ratingCalculator_cloudSave_history_counts_keptUserEdit,
  skippedDeleted: m.ratingCalculator_cloudSave_history_counts_skippedDeleted,
  skippedUnknownSheet: m.ratingCalculator_cloudSave_history_counts_skippedUnknownSheet,
  rejected: m.ratingCalculator_cloudSave_history_counts_rejected,
} satisfies Partial<
  Record<keyof ImportJobDTO['counts'], (inputs: { count: number }, options: { locale: Locale }) => string>
>

/** "12 new · 30 improved · 400 unchanged": what a job changed, zeros left out */
export function summarizeImportJob(job: ImportJobDTO, locale: Locale): string {
  const keys = ['inserted', 'improved', 'provenanceUpgraded', 'unchanged', 'keptUserEdit'] as const
  const parts = keys
    .filter((key) => job.counts[key] > 0)
    .map((key) => IMPORT_COUNT_MESSAGES[key]({ count: job.counts[key] }, { locale }))
  return parts.length ? parts.join(' · ') : m.ratingCalculator_cloudSave_history_counts_none({}, { locale })
}
/**
 * Toasts what a cloud file import left out: entries that match no chart, and entries the server's import schema
 * rejects (an out-of-range value…). Nothing for the local save.
 */
export function announceImportLeftOut(result: ImportResult, locale: Locale, notify: (message: string) => void) {
  if (result.skipped) notify(m.ratingCalculator_cloudSave_import_skipped({ count: result.skipped }, { locale }))
  if (result.rejected) notify(m.ratingCalculator_cloudSave_import_rejected({ count: result.rejected }, { locale }))
}

/** What to tell the user about a cloud import error they can act on; `null` for any other error */
export function cloudImportErrorMessage(error: unknown, locale: Locale): string | null {
  if (error instanceof NothingToImportError)
    return m.ratingCalculator_cloudSave_import_errors_nothingToImport({}, { locale })
  if (error instanceof ImportAlreadyRunningError)
    return m.ratingCalculator_cloudSave_import_errors_alreadyRunning({}, { locale })
  if (error instanceof ImportTooLargeError) return m.ratingCalculator_cloudSave_import_errors_tooLarge({}, { locale })
  return null
}