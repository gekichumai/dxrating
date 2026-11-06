import { fromAchievementInt } from '@gekichumai/maimai-domain'
import { Button } from '@mui/material'
import clsx from 'clsx'
import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSongCatalog } from '@/catalog/CatalogContext'
import { useCloudSaveStatus, useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import type { SyncIssue } from '@/models/scores/ScoreRepository'
import './cloud-save.css'

const FLAG_LABELS: Record<string, string> = {
  fc: 'FC',
  fcp: 'FC+',
  ap: 'AP',
  app: 'AP+',
  sync: 'SYNC',
  fs: 'FS',
  fsp: 'FS+',
  fsd: 'FSD',
  fsdp: 'FSD+',
}

function useDateTimeFormat() {
  const { i18n } = useTranslation()
  return useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    }
  }, [i18n.language])
}

const SyncIssueItem: FC<{ issue: SyncIssue; onReapply: () => void; onDismiss: () => void }> = ({
  issue,
  onReapply,
  onDismiss,
}) => {
  const { t } = useTranslation(['rating-calculator'])
  const catalog = useSongCatalog()
  const format = useDateTimeFormat()
  const sheet = catalog.getById(issue.sheetId)
  const { intent } = issue

  const value =
    intent.op === 'delete'
      ? t('rating-calculator:cloud-save.issues.value-removed')
      : intent.value
        ? [
            `${fromAchievementInt(intent.value.achievement).toFixed(4)}%`,
            intent.value.comboFlag && FLAG_LABELS[intent.value.comboFlag],
            intent.value.syncFlag && FLAG_LABELS[intent.value.syncFlag],
          ]
            .filter(Boolean)
            .join(' ')
        : ''
  const method = t(`rating-calculator:cloud-save.issues.method.${intent.entryMethod}`)
  const madeAt = intent.clientEditedAt ?? issue.createdAt
  const time = Number.isNaN(Date.parse(madeAt)) ? null : format.format(new Date(madeAt))
  const titleId = `sync-issue-${issue.id}`

  return (
    <li className="flex flex-col gap-1.5 glass-inset p-2.5" aria-labelledby={titleId}>
      {/* Only the song title truncates (whole in its tooltip): the chart, which tells issues of one song apart, stays */}
      <div id={titleId} className="flex min-w-0 items-baseline gap-1 text-sm font-semibold text-fg-1">
        {sheet ? (
          <>
            <span className="min-w-0 truncate" title={sheet.title}>
              {sheet.title}
            </span>{' '}
            <span className="shrink-0 whitespace-nowrap">{`· ${sheet.type.toUpperCase()} ${sheet.difficulty.toUpperCase()}`}</span>
          </>
        ) : (
          <span className="min-w-0 truncate">{issue.sheetId}</span>
        )}
      </div>
      <div className="text-xs text-fg-2">
        {t('rating-calculator:cloud-save.issues.your-value', { value })}
        <span className="text-fg-2">
          {' · '}
          {method}
          {time && ` · ${time}`}
        </span>
      </div>
      <p className="m-0 text-xs text-fg-2 text-pretty">
        {issue.kind === 'superseded'
          ? t('rating-calculator:cloud-save.issues.superseded')
          : t('rating-calculator:cloud-save.issues.rejected')}
      </p>
      <div className="flex flex-wrap justify-end gap-1">
        <Button size="small" color="inherit" onClick={onDismiss}>
          {t('rating-calculator:cloud-save.issues.dismiss')}
        </Button>
        {issue.kind === 'superseded' && (
          <Button size="small" variant="outlined" onClick={onReapply}>
            {t('rating-calculator:cloud-save.issues.use-mine')}
          </Button>
        )}
      </div>
    </li>
  )
}

/** The changes the server did not take (§5.4), each with what can be done about it; nothing on the local save */
export const SyncIssuesList: FC<{ emptyClassName?: string }> = ({ emptyClassName }) => {
  const { t } = useTranslation(['rating-calculator'])
  const cloud = useCloudSaveUi()
  const status = useCloudSaveStatus()
  if (!cloud || !status) return null
  if (status.issues.length === 0) {
    return (
      <p className={clsx('m-0 text-sm text-fg-2', emptyClassName)}>{t('rating-calculator:cloud-save.issues.empty')}</p>
    )
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={t('rating-calculator:cloud-save.issues.title')}>
      {status.issues.map((issue) => (
        <SyncIssueItem
          key={issue.id}
          issue={issue}
          onReapply={() => cloud.controller.reapplyIssue(issue.id)}
          onDismiss={() => cloud.controller.dismissIssue(issue.id)}
        />
      ))}
    </ul>
  )
}