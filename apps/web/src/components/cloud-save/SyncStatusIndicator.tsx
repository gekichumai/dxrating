import { ButtonBase, Popover } from '@mui/material'
import clsx from 'clsx'
import { type FC, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiCloudAlertOutline from '~icons/mdi/cloud-alert-outline'
import IconMdiCloudCheckOutline from '~icons/mdi/cloud-check-outline'
import IconMdiCloudOffOutline from '~icons/mdi/cloud-off-outline'
import IconMdiCloudSyncOutline from '~icons/mdi/cloud-sync-outline'
import { useCloudSaveStatus } from '@/models/scores/CloudSaveUiContext'
import type { ScoreRepositoryStatus } from '@/models/scores/ScoreRepository'
import { SyncIssuesList } from './SyncIssuesList'
import './cloud-save.css'

const STATE_ICONS: Record<ScoreRepositoryStatus['state'], FC<{ className?: string }>> = {
  idle: IconMdiCloudCheckOutline,
  syncing: IconMdiCloudSyncOutline,
  offline: IconMdiCloudOffOutline,
  error: IconMdiCloudAlertOutline,
}

/**
 * The cloud save's sync state in the header (idle, syncing, offline, error), the number of changes waiting to be
 * sent and the sync issues. Renders nothing on the local save.
 */
export const SyncStatusIndicator: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const status = useCloudSaveStatus()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const popoverId = useId()
  if (!status) return null

  const { state, pendingCount, issues } = status
  const Icon = STATE_ICONS[state]
  const stateText = t(`rating-calculator:cloud-save.status.${state}`)
  const pendingText =
    pendingCount > 0 ? t('rating-calculator:cloud-save.status.pending', { count: pendingCount }) : null
  const issuesText =
    issues.length > 0 ? t('rating-calculator:cloud-save.status.issues', { count: issues.length }) : null
  const label = [t('rating-calculator:cloud-save.title'), stateText, pendingText, issuesText].filter(Boolean).join(', ')

  return (
    <>
      <ButtonBase
        onClick={(event) => setAnchorEl(event.currentTarget)}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={anchorEl ? 'true' : 'false'}
        aria-controls={anchorEl ? popoverId : undefined}
        className="cloud-save-status-button relative mr-1 flex h-9 min-w-9 items-center justify-center gap-1 rounded-full bg-white/35 px-2 text-black/75"
        data-sync-state={state}
      >
        <Icon className={clsx('size-5', state === 'syncing' && 'cloud-save-spin')} aria-hidden />
        {pendingCount > 0 && (
          <span className="text-xs font-semibold tabular-nums" aria-hidden>
            {pendingCount}
          </span>
        )}
        {issues.length > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[0.625rem] font-bold leading-none text-white shadow-sm tabular-nums"
            aria-hidden
          >
            {issues.length}
          </span>
        )}
      </ButtonBase>

      <Popover
        id={popoverId}
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            className: 'cloud-save-surface',
            role: 'dialog',
            'aria-label': t('rating-calculator:cloud-save.title'),
            sx: { mt: 1, width: '22rem', maxWidth: 'calc(100vw - 1rem)', borderRadius: '0.75rem', p: '0.375rem' },
          },
        }}
      >
        <div className="flex flex-col gap-2 p-2">
          <div className="flex items-center gap-2">
            <Icon className="size-5 shrink-0 text-zinc-600" aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900">{t('rating-calculator:cloud-save.title')}</div>
              <output className="block text-xs text-zinc-600">
                {[stateText, pendingText].filter(Boolean).join(' · ')}
              </output>
            </div>
          </div>
          <h3 className="m-0 mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t('rating-calculator:cloud-save.issues.title')}
          </h3>
        </div>
        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          <SyncIssuesList emptyClassName="px-2 pb-2" />
        </div>
      </Popover>
    </>
  )
}