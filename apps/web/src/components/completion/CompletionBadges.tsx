import type { FC } from 'react'
import { achievementRankLabel, COMBO_LABELS, type CompletionRecord, SYNC_LABELS } from './completion'

const badge = 'inline-block px-1.5 py-0.5 rounded-md text-[11px] font-bold leading-none'

/** Rank / FC / FS badges of one record */
export const CompletionBadges: FC<{ record: CompletionRecord | undefined }> = ({ record }) => {
  if (!record) return <span className="text-xs opacity-50">–</span>
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      <span
        className={`${badge} bg-violet-500/15 text-violet-700 dark:text-violet-300`}
        title={`${record.achievementRate.toFixed(4)}%`}
      >
        {achievementRankLabel(record.achievementRate)}
      </span>
      {record.comboFlag && (
        <span className={`${badge} bg-amber-500/15 text-amber-700 dark:text-amber-300`}>
          {COMBO_LABELS[record.comboFlag]}
        </span>
      )}
      {record.syncFlag && record.syncFlag !== 'sync' && (
        <span className={`${badge} bg-sky-500/15 text-sky-700 dark:text-sky-300`}>{SYNC_LABELS[record.syncFlag]}</span>
      )}
    </span>
  )
}