import { ButtonBase, Popover } from '@mui/material'
import clsx from 'clsx'
import { type CSSProperties, type FC, useId, useState } from 'react'
import IconMdiCloudAlertOutline from '~icons/mdi/cloud-alert-outline'
import IconMdiCloudCheckOutline from '~icons/mdi/cloud-check-outline'
import IconMdiCloudOffOutline from '~icons/mdi/cloud-off-outline'
import IconMdiCloudSyncOutline from '~icons/mdi/cloud-sync-outline'
import { useCloudSaveStatus } from '@/models/scores/CloudSaveUiContext'
import type { ScoreRepositoryStatus } from '@/models/scores/ScoreRepository'
import { labelSeparator } from './provenanceLabel'
import { SyncIssuesList } from './SyncIssuesList'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import './cloud-save.css'

const STATE_ICONS: Record<ScoreRepositoryStatus['state'], FC<{ className?: string }>> = {
  idle: IconMdiCloudCheckOutline,
  syncing: IconMdiCloudSyncOutline,
  offline: IconMdiCloudOffOutline,
  error: IconMdiCloudAlertOutline,
}

const STATE_MESSAGES: Record<ScoreRepositoryStatus['state'], PlainMessage> = {
  idle: m.ratingCalculator_cloudSave_status_idle,
  syncing: m.ratingCalculator_cloudSave_status_syncing,
  offline: m.ratingCalculator_cloudSave_status_offline,
  error: m.ratingCalculator_cloudSave_status_error,
}

/**
 * The cloud save's sync state in the header (idle, syncing, offline, error), the number of changes waiting to be
 * sent and the sync issues. Renders nothing on the local save.
 */
export const SyncStatusIndicator: FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => {
  const locale = useLocale()
  const status = useCloudSaveStatus()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const popoverId = useId()
  if (!status) return null

  const { state, pendingCount, issues } = status
  const Icon = STATE_ICONS[state]
  const stateText = STATE_MESSAGES[state]({}, { locale })
  const pendingText =
    pendingCount > 0 ? m.ratingCalculator_cloudSave_status_pending({ count: pendingCount }, { locale }) : null
  const issuesText =
    issues.length > 0 ? m.ratingCalculator_cloudSave_status_issues({ count: issues.length }, { locale }) : null
  const label = [m.ratingCalculator_cloudSave_title({}, { locale }), stateText, pendingText, issuesText]
    .filter(Boolean)
    .join(', ')
  // Announced when it changes: a sync that stopped working and new issues, not every "Syncing…"
  const announcement = [state === 'offline' || state === 'error' ? stateText : null, issuesText]
    .filter(Boolean)
    .join(', ')

  return (
    <>
      <ButtonBase
        onClick={(event) => setAnchorEl(event.currentTarget)}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={anchorEl ? 'true' : 'false'}
        aria-controls={anchorEl ? popoverId : undefined}
        // One number only: the badge counts sync issues, the ones that need the user. Changes waiting to sync are in
        // the label and the popover, so the control keeps one width. The same 36px round action as the rest of the
        // header's glass pill
        className={clsx(
          'cloud-save-status-button relative flex size-9 shrink-0 items-center justify-center rounded-full text-fg-1',
          className,
        )}
        style={style}
        data-sync-state={state}
      >
        <Icon className={clsx('size-5', state === 'syncing' && 'cloud-save-pulse')} aria-hidden />
        {issues.length > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-warning px-1 text-[0.625rem] font-bold leading-none text-on-accent shadow-sm tabular-nums"
            aria-hidden
          >
            {issues.length}
          </span>
        )}
      </ButtonBase>
      <output className="sr-only">{announcement}</output>

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
            'aria-label': m.ratingCalculator_cloudSave_title({}, { locale }),
            sx: {
              mt: 1,
              width: '22rem',
              maxWidth: 'calc(100vw - 1rem)',
              borderRadius: 'var(--radius-lg)',
              p: '0.375rem',
              backgroundImage: 'none',
            },
          },
        }}
      >
        <div className="flex flex-col gap-2 p-2">
          <div className="flex items-center gap-2">
            <Icon className="size-5 shrink-0 text-fg-2" aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg-1">
                {m.ratingCalculator_cloudSave_title({}, { locale })}
              </div>
              {/* Not a live region: the sync cycles would be read out while the popover is open */}
              <p className="m-0 text-xs text-fg-2">
                {[stateText, pendingText].filter(Boolean).join(labelSeparator(locale))}
              </p>
            </div>
          </div>
          {/* The header's announcement is hidden while the popover is open (a modal): the same one, here */}
          <output className="sr-only">{announcement}</output>
          <h3 className="m-0 mt-1 text-xs font-semibold uppercase tracking-wide text-fg-2">
            {m.ratingCalculator_cloudSave_issues_title({}, { locale })}
          </h3>
        </div>
        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          <SyncIssuesList emptyClassName="px-2 pb-2" />
        </div>
      </Popover>
    </>
  )
}