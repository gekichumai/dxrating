import type { FC, ReactNode } from 'react'
import { useId } from 'react'
import { useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import { ImportHistoryList } from './ImportHistoryList'
import { SaveSelector } from './SaveSelector'
import { SyncIssuesList } from './SyncIssuesList'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'

const Group: FC<{ title: string; description?: string; children: ReactNode }> = ({ title, description, children }) => {
  const id = useId()
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="m-0 text-sm font-semibold text-fg-1">
          {title}
        </h2>
        {description && <p className="m-0 text-xs text-fg-2 text-pretty">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** The account menu's cloud save section: saves, sync issues, import history. Only while a cloud save is active */
export const CloudSaveSection: FC = () => {
  const locale = useLocale()
  const cloud = useCloudSaveUi()
  if (!cloud) return null
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold m-0">{m.ratingCalculator_cloudSave_title({}, { locale })}</h1>
        <p className="text-sm text-fg-2 m-0">{m.ratingCalculator_cloudSave_description({}, { locale })}</p>
      </div>
      <Group
        title={m.ratingCalculator_cloudSave_saves_title({}, { locale })}
        description={m.ratingCalculator_cloudSave_saves_description({}, { locale })}
      >
        <SaveSelector />
      </Group>
      <Group title={m.ratingCalculator_cloudSave_issues_title({}, { locale })}>
        <SyncIssuesList />
      </Group>
      <Group title={m.ratingCalculator_cloudSave_history_title({}, { locale })}>
        <ImportHistoryList />
      </Group>
    </div>
  )
}