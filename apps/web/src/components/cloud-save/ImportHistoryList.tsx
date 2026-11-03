import type { ImportCountsDTO, ImportJobDTO } from '@gekichumai/api-contract'
import { CircularProgress } from '@mui/material'
import { type FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import { importHistoryFailure } from './importFailureMessage'
import { LoadError } from './LoadError'
import { sourceName } from './provenanceLabel'

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

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; jobs: readonly ImportJobDTO[] }

/** The recent imports of the active cloud save (`GET /saves/{id}/imports`), with what each one changed */
export const ImportHistoryList: FC = () => {
  const { t, i18n } = useTranslation(['rating-calculator'])
  const cloud = useCloudSaveUi()
  const controller = cloud?.controller ?? null
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const format = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    }
  }, [i18n.language])

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
      <output className="flex items-center gap-2 py-2 text-sm text-zinc-500">
        <CircularProgress size="1rem" aria-hidden />
        {t('rating-calculator:cloud-save.history.loading')}
      </output>
    )
  }
  if (state.kind === 'error') {
    return (
      <LoadError
        message={t('rating-calculator:cloud-save.history.error')}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    )
  }
  if (state.jobs.length === 0) {
    return <p className="m-0 text-sm text-zinc-500">{t('rating-calculator:cloud-save.history.empty')}</p>
  }

  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-zinc-900/8 p-0">
      {state.jobs.map((job) => {
        const counts = COUNT_KEYS.filter((key) => job.counts[key] > 0).map((key) =>
          t(`rating-calculator:cloud-save.history.counts.${key}`, { count: job.counts[key] }),
        )
        const status =
          job.status === 'failed'
            ? importHistoryFailure(job.errorCode, t)
            : job.status === 'running'
              ? t('rating-calculator:cloud-save.history.running')
              : null
        const startedAt = Date.parse(job.startedAt)
        return (
          <li key={job.id} className="flex flex-col gap-0.5 py-2" data-job-status={job.status}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold text-zinc-900">
                {/* What this browser uploaded itself (§7.4 fallback, migration): never named as a verified provider */}
                {job.source === 'legacy-local'
                  ? t('rating-calculator:cloud-save.provenance.from-device')
                  : sourceName(job.source)}
              </span>
              <span className="text-xs text-zinc-500">
                {t(`rating-calculator:cloud-save.history.trigger.${job.trigger}`)}
                {Number.isNaN(startedAt) ? '' : ` · ${format.format(new Date(startedAt))}`}
              </span>
            </div>
            {status && (
              <span className={job.status === 'failed' ? 'text-xs text-red-700' : 'text-xs text-zinc-600'}>
                {status}
              </span>
            )}
            {counts.length > 0 && <span className="text-xs text-zinc-600 tabular-nums">{counts.join(' · ')}</span>}
          </li>
        )
      })}
    </ul>
  )
}