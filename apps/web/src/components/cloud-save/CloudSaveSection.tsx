import type { FC, ReactNode } from 'react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import { ImportHistoryList } from './ImportHistoryList'
import { SaveSelector } from './SaveSelector'
import { SyncIssuesList } from './SyncIssuesList'

const Group: FC<{ title: string; description?: string; children: ReactNode }> = ({ title, description, children }) => {
  const id = useId()
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="m-0 text-sm font-semibold text-zinc-800">
          {title}
        </h2>
        {description && <p className="m-0 text-xs text-zinc-500 text-pretty">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** The account menu's cloud save section: saves, sync issues, import history. Only while a cloud save is active */
export const CloudSaveSection: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const cloud = useCloudSaveUi()
  if (!cloud) return null
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold m-0">{t('rating-calculator:cloud-save.title')}</h1>
        <p className="text-sm text-zinc-500 m-0">{t('rating-calculator:cloud-save.description')}</p>
      </div>
      <Group
        title={t('rating-calculator:cloud-save.saves.title')}
        description={t('rating-calculator:cloud-save.saves.description')}
      >
        <SaveSelector />
      </Group>
      <Group title={t('rating-calculator:cloud-save.issues.title')}>
        <SyncIssuesList />
      </Group>
      <Group title={t('rating-calculator:cloud-save.history.title')}>
        <ImportHistoryList />
      </Group>
    </div>
  )
}