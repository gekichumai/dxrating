import type { SaveDTO } from '@gekichumai/api-contract'
import { CircularProgress } from '@mui/material'
import clsx from 'clsx'
import { type FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiCheck from '~icons/mdi/check'
import { useCloudSaveStatus, useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import { LoadError } from './LoadError'
import { formatLocalDate, labelSeparator } from './provenanceLabel'
import './cloud-save.css'

const REGION_LABELS: Record<SaveDTO['region'], string> = {
  jp: 'JP',
  intl: 'Intl',
  cn: 'CN',
  _generic: '',
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; saves: readonly SaveDTO[] }

/**
 * The user's cloud saves (design §8.2, the simplified #182): name, region, record count, last sync and the B50 of
 * the latest snapshot. Choosing one switches the active save. Creating saves comes with the first sign-in migration.
 */
export const SaveSelector: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const cloud = useCloudSaveUi()
  // Re-render when the active save changes under the same controller (the demo)
  useCloudSaveStatus()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  // Bumped by "Try again" after a failed load
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!cloud) return
    let cancelled = false
    setState({ kind: 'loading' })
    cloud.listSaves().then(
      (saves) => !cancelled && setState({ kind: 'loaded', saves }),
      () => !cancelled && setState({ kind: 'error' }),
    )
    return () => {
      cancelled = true
    }
  }, [cloud, attempt])

  if (!cloud) return null
  if (state.kind === 'loading') {
    return (
      <output className="flex items-center gap-2 py-2 text-sm text-zinc-500">
        <CircularProgress size="1rem" aria-hidden />
        {t('rating-calculator:cloud-save.saves.loading')}
      </output>
    )
  }
  if (state.kind === 'error') {
    return (
      <LoadError
        message={t('rating-calculator:cloud-save.saves.error')}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    )
  }
  if (state.saves.length === 0) {
    return <p className="m-0 text-sm text-zinc-500">{t('rating-calculator:cloud-save.saves.empty')}</p>
  }

  return (
    <SaveOptionList
      saves={state.saves}
      activeId={cloud.controller.saveId}
      onChoose={(id) => cloud.setActiveSaveId(id)}
    />
  )
}

/**
 * The saves as a list of buttons: name, region, record count, the B50 of the latest snapshot and the last sync.
 * `activeId`: the save in use, marked and not chosen again; `null` when none is (the local save is active).
 */
export const SaveOptionList: FC<{
  saves: readonly SaveDTO[]
  activeId: string | null
  onChoose(saveId: string): void
}> = ({ saves, activeId, onChoose }) => {
  const { t, i18n } = useTranslation(['rating-calculator'])
  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
  const separator = labelSeparator(i18n.language)
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('rating-calculator:cloud-save.saves.title')}>
      {saves.map((save) => {
        const active = save.id === activeId
        const region = REGION_LABELS[save.region] || t('rating-calculator:cloud-save.saves.region-any')
        const details = [
          t('rating-calculator:cloud-save.saves.records', {
            count: save.recordCount,
            formatted: numberFormat.format(save.recordCount),
          }),
          save.latestSnapshot &&
            t('rating-calculator:cloud-save.saves.b50', { rating: numberFormat.format(save.latestSnapshot.b50Sum) }),
          t('rating-calculator:cloud-save.saves.last-sync', { date: formatLocalDate(save.updatedAt) }),
        ].filter(Boolean)
        return (
          <li key={save.id}>
            <button
              type="button"
              className={clsx(
                'cloud-save-save-option flex w-full cursor-pointer items-center gap-3 rounded-lg border-none px-3 py-2 text-left',
                active ? 'bg-zinc-900/6 ring-1 ring-inset ring-zinc-900/10' : 'bg-transparent',
              )}
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                if (!active) onChoose(save.id)
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-900">{save.name}</span>
                  <span className="shrink-0 rounded-sm bg-zinc-900/8 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-zinc-700">
                    {region}
                  </span>
                </span>
                {/* Each detail stays on one line ("last synced 2026-11-02" never breaks inside the date) and carries
                    its separator, so a wrapped line starts with "·" instead of the line above ending in one */}
                <span className="text-xs text-zinc-600 tabular-nums">
                  {details.map((detail, index) => (
                    <span key={index}>
                      {index > 0 && separator.startsWith(' ') && ' '}
                      <span className="whitespace-nowrap">
                        {index > 0 && separator.trimStart()}
                        {detail}
                      </span>
                    </span>
                  ))}
                </span>
              </span>
              {active && <IconMdiCheck className="size-5 shrink-0 text-zinc-700" aria-hidden />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}