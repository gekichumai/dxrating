import type { FC, ReactNode } from 'react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@mui/material'
import { useActiveSave } from '@/models/scores/ActiveSaveContext'
import { useCloudMigrationOffer } from '@/models/scores/CloudMigrationContext'
import { useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import { CloudSaveOptIn } from './CloudSaveOptIn'
import { DownloadMyDataButton } from './DownloadMyDataButton'
import { ImportHistoryList } from './ImportHistoryList'
import { SaveSelector } from './SaveSelector'
import { SyncIssuesList } from './SyncIssuesList'

const Group: FC<{
  title: string
  description?: string
  children: ReactNode
}> = ({ title, description, children }) => {
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

/**
 * Whether the account menu has a cloud save section: while a cloud save is active, or the server enables cloud save
 * for the user, or offers the beta opt-in. Never for anonymous visitors, nor with cloud save off.
 */
export function useHasCloudSaveSection(): boolean {
  const cloud = useCloudSaveUi()
  const { features } = useActiveSave()
  return !!cloud || features?.cloudSave === true || features?.optInAvailable === true
}

/**
 * The account menu's cloud save section: the beta opt-in, the first sign-in migration ("Back up to cloud"), the saves,
 * sync issues and import history of the active cloud save, and "Download my data"
 */
export const CloudSaveSection: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const cloud = useCloudSaveUi()
  const { features } = useActiveSave()
  const migration = useCloudMigrationOffer()
  const visible = useHasCloudSaveSection()
  if (!visible) return null
  const cloudSaveOn = !!cloud || features?.cloudSave === true
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {/* Takes the focus when "Back up to cloud" goes away (the migration made a cloud save active) */}
        <h1 className="text-lg font-bold m-0 outline-none" tabIndex={-1} data-cloud-migration-focus-return="">
          {t('rating-calculator:cloud-save.title')}
        </h1>
        <p className="text-sm text-zinc-500 m-0">{t('rating-calculator:cloud-save.description')}</p>
      </div>
      <CloudSaveOptIn />
      {migration.available && (
        <Group
          title={t('rating-calculator:cloud-save.migration.title')}
          description={t('rating-calculator:cloud-save.migration.section-description', {
            count: migration.localCount,
          })}
        >
          <div>
            <Button size="small" variant="contained" onClick={migration.open}>
              {t('rating-calculator:cloud-save.migration.back-up')}
            </Button>
          </div>
        </Group>
      )}
      {cloud && (
        <>
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
        </>
      )}
      {cloudSaveOn && (
        <Group
          title={t('rating-calculator:cloud-save.export.title')}
          description={t('rating-calculator:cloud-save.export.description')}
        >
          <DownloadMyDataButton />
        </Group>
      )}
    </div>
  )
}