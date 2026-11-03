import type { ImportJobDTO } from '@gekichumai/api-contract'
import type { TFunction } from 'i18next'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'
import { cloudImportConfirm } from '@/components/cloud-save/cloudImportConfirm'
import type {
  ImportMeta,
  ImportProgress,
  ImportResult,
  ScoreRepository,
  ServerImportArgs,
  ServerImportKind,
} from '@/models/scores/ScoreRepository'

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
 * Imports entries read from a file. On a cloud save the user first chooses to merge or to clear the save first
 * (§5.3 rule 5); `null` when they cancel. On the local save, exactly the call it always was.
 */
export async function importFileEntries(
  repository: ScoreRepository,
  entries: PlayEntry[],
  meta: ImportMeta,
): Promise<ImportResult | null> {
  if (repository.kind !== 'cloud') return repository.applyImport(entries, meta)
  const choice = await cloudImportConfirm.request(entries.length)
  if (!choice) return null
  return repository.applyImport(entries, { ...meta, mode: choice })
}

/**
 * Provider records the browser fetched itself, on a cloud save with server imports off (the §7.4 fallback): merged,
 * never replacing the save. Uploaded as `client_reported`.
 */
export function importFallbackEntries(
  repository: ScoreRepository,
  entries: PlayEntry[],
  source: ImportMeta['source'],
): Promise<ImportResult> {
  return repository.applyImport(entries, { source, mode: 'merge' })
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

/** "12 new · 30 improved · 400 unchanged": what a job changed, zeros left out */
export function summarizeImportJob(job: ImportJobDTO, t: TFunction): string {
  const keys = ['inserted', 'improved', 'provenanceUpgraded', 'unchanged', 'keptUserEdit'] as const
  const parts = keys
    .filter((key) => job.counts[key] > 0)
    .map((key) => t(`rating-calculator:cloud-save.history.counts.${key}`, { count: job.counts[key] }))
  return parts.length ? parts.join(' · ') : t('rating-calculator:cloud-save.history.counts.none')
}