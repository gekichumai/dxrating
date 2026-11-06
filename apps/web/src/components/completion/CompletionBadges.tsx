import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { achievementRankLabel, COMBO_LABELS, type CompletionRecord, SYNC_LABELS } from './completion'

const badge = 'inline-block px-1.5 py-1 rounded-[var(--radius-sm)] text-xs font-semibold leading-none'

/** Rank / FC / FS badges of one record */
export const CompletionBadges: FC<{ record: CompletionRecord | undefined }> = ({ record }) => {
  const { t } = useTranslation(['completion'])
  if (!record)
    return (
      <span className="text-xs text-fg-2">
        <span aria-hidden>–</span>
        <span className="sr-only">{t('completion:status-unplayed-sr')}</span>
      </span>
    )
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      <span className={`${badge} bg-black/6 text-fg-1`} title={`${record.achievementRate.toFixed(4)}%`}>
        {achievementRankLabel(record.achievementRate)}
      </span>
      {record.comboFlag && (
        <span className={`${badge} bg-amber-500/15 text-amber-800`}>{COMBO_LABELS[record.comboFlag]}</span>
      )}
      {record.syncFlag && record.syncFlag !== 'sync' && (
        <span className={`${badge} bg-sky-500/15 text-sky-800`}>{SYNC_LABELS[record.syncFlag]}</span>
      )}
    </span>
  )
}