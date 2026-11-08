import type { ImportCountsDTO, ImportJobDTO } from '@gekichumai/api-contract'
import { CircularProgress } from '@mui/material'
import { type FC, useEffect, useMemo, useState } from 'react'
import { useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import { importHistoryFailure } from './importFailureMessage'
import { LoadError } from './LoadError'
import { sourceName } from './provenanceLabel'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { IMPORT_COUNT_MESSAGES } from '@/components/rating/io/import/cloudImport'

/** The counts shown for a job, in this order; zeros are left out */
const COUNT_KEYS = [
  'inserted',
  'improved',
  'provenanceUpgraded',
  'unchanged',
  'keptUserEdit',
  'skippedDeleted',
  'skippedUnknownSheet',
  'rejected',
] as const satisfies (keyof ImportCountsDTO)[]

const TRIGGER_MESSAGES = {
  user: m.ratingCalculator_cloudSave_history_trigger_user,
  auto: m.ratingCalculator_cloudSave_history_trigger_auto,
  migration: m.ratingCalculator_cloudSave_history_trigger_migration,
} satisfies Record<ImportJobDTO['trigger'], PlainMessage>

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; jobs: readonly ImportJobDTO[] }

/** The recent imports of the active cloud save (`GET /saves/{id}/imports`), with what each one changed */
export const ImportHistoryList: FC = () => {
  const locale = useLocale()
  const cloud = useCloudSaveUi()
  const controller = cloud?.controller ?? null
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const format = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    }
  }, [locale])

  // Bumped by "Try again" after a failed load
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!controller) return
    let cancelled = false
    setState({ kind: 'loading' })
    controller.listImportJobs(20).then(
      (jobs) => !cancelled && setState({ kind: 'loaded', jobs }),
      () => !cancelled && setState({ kind: 'error' }),
    )
    return () => {
      cancelled = true
    }
  }, [controller, attempt])

  if (!controller) return null
  if (state.kind === 'loading') {
    return (
      <output className="flex items-center gap-2 py-2 text-sm text-fg-2">
        <CircularProgress size="1rem" aria-hidden />
        {m.ratingCalculator_cloudSave_history_loading({}, { locale })}
      </output>
    )
  }
  if (state.kind === 'error') {
    return (
      <LoadError
        message={m.ratingCalculator_cloudSave_history_error({}, { locale })}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    )
  }
  if (state.jobs.length === 0) {
    return <p className="m-0 text-sm text-fg-2">{m.ratingCalculator_cloudSave_history_empty({}, { locale })}</p>
  }

  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-black/8 p-0">
      {state.jobs.map((job) => {
        const counts = COUNT_KEYS.filter((key) => job.counts[key] > 0).map((key) =>
          IMPORT_COUNT_MESSAGES[key]({ count: job.counts[key] }, { locale }),
        )
        const status =
          job.status === 'failed'
            ? importHistoryFailure(job.errorCode, locale)
            : job.status === 'running'
              ? m.ratingCalculator_cloudSave_history_running({}, { locale })
              : null
        const startedAt = Date.parse(job.startedAt)
        return (
          <li key={job.id} className="flex flex-col gap-0.5 py-2" data-job-status={job.status}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold text-fg-1">
                {/* What this browser uploaded itself (§7.4 fallback, migration): never named as a verified provider */}
                {job.source === 'legacy-local'
                  ? m.ratingCalculator_cloudSave_provenance_fromDevice({}, { locale })
                  : sourceName(job.source)}
              </span>
              <span className="text-xs text-fg-2">
                {TRIGGER_MESSAGES[job.trigger]({}, { locale })}
                {Number.isNaN(startedAt) ? '' : ` · ${format.format(new Date(startedAt))}`}
              </span>
            </div>
            {status && (
              <span className={job.status === 'failed' ? 'text-xs text-danger' : 'text-xs text-fg-2'}>{status}</span>
            )}
            {counts.length > 0 && <span className="text-xs text-fg-2 tabular-nums">{counts.join(' · ')}</span>}
          </li>
        )
      })}
    </ul>
  )
}