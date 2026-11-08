import type { FC, ReactNode } from 'react'
import { useCallback, useId, useRef, useState } from 'react'
import { Button } from '@mui/material'
import { useActiveSave } from '@/models/scores/ActiveSaveContext'
import { focusMigrationReturnTarget, useCloudMigrationOffer } from '@/models/scores/CloudMigrationContext'
import { useCloudSaveUi } from '@/models/scores/CloudSaveUiContext'
import { ChooseCloudSaveDialog } from './ChooseCloudSaveDialog'
import { CloudSaveOptIn } from './CloudSaveOptIn'
import { DownloadMyDataButton } from './DownloadMyDataButton'
import { ImportHistoryList } from './ImportHistoryList'
import { SaveSelector } from './SaveSelector'
import { SyncIssuesList } from './SyncIssuesList'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'

const Group: FC<{
  title: string
  description?: string
  children: ReactNode
}> = ({ title, description, children }) => {
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
 * The account menu's cloud save section: the beta opt-in, the first sign-in migration ("Back up to cloud"), "Use a
 * cloud save" on a browser with nothing to back up, the saves, sync issues and import history of the active cloud
 * save, and "Download my data"
 */
export const CloudSaveSection: FC = () => {
  const locale = useLocale()
  const cloud = useCloudSaveUi()
  const { features, userId, decided, kind, listSaves, setActiveSaveId } = useActiveSave()
  const migration = useCloudMigrationOffer()
  const visible = useHasCloudSaveSection()
  const sectionRef = useRef<HTMLDivElement>(null)
  const [chooseOpen, setChooseOpen] = useState(false)
  const chose = useRef(false)
  const closeChoose = useCallback(() => {
    setChooseOpen(false)
    if (!chose.current) return
    chose.current = false
    // "Use a cloud save" goes once the save is active: the focus goes to the section's heading, after the dialog
    // gave it back
    setTimeout(() => focusMigrationReturnTarget(sectionRef.current), 0)
  }, [])
  const chooseSave = useCallback(
    (saveId: string) => {
      chose.current = true
      setActiveSaveId(saveId)
    },
    [setActiveSaveId],
  )
  if (!visible) return null
  const cloudSaveOn = !!cloud || features?.cloudSave === true
  // A browser with no cloud save chosen and nothing to back up (the migration offer needs local records): the
  // account's existing saves can still be chosen, without uploading anything
  const chooseAvailable =
    !cloud && features?.cloudSave === true && !!userId && decided && kind === 'local' && !migration.available
  return (
    <div ref={sectionRef} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {/* Takes the focus when "Back up to cloud" goes away (the migration made a cloud save active) */}
        <h1
          className="text-lg font-semibold text-fg-1 m-0 outline-none"
          tabIndex={-1}
          data-cloud-migration-focus-return=""
        >
          {m.ratingCalculator_cloudSave_title({}, { locale })}
        </h1>
        <p className="text-sm text-fg-2 m-0">
          {/* Nothing is in sync until a cloud save is active */}
          {(cloud ? m.ratingCalculator_cloudSave_description : m.ratingCalculator_cloudSave_descriptionInactive)(
            {},
            { locale },
          )}
        </p>
      </div>
      <CloudSaveOptIn />
      {migration.available && (
        <Group
          title={m.ratingCalculator_cloudSave_migration_title({}, { locale })}
          description={m.ratingCalculator_cloudSave_migration_sectionDescription(
            {
              count: migration.localCount,
            },
            { locale },
          )}
        >
          <div>
            <Button size="small" variant="contained" onClick={migration.open}>
              {m.ratingCalculator_cloudSave_migration_backUp({}, { locale })}
            </Button>
          </div>
        </Group>
      )}
      {chooseAvailable && (
        <Group
          title={m.ratingCalculator_cloudSave_choose_title({}, { locale })}
          description={m.ratingCalculator_cloudSave_choose_sectionDescription({}, { locale })}
        >
          <div>
            <Button size="small" variant="contained" onClick={() => setChooseOpen(true)}>
              {m.ratingCalculator_cloudSave_choose_open({}, { locale })}
            </Button>
          </div>
          {chooseOpen && (
            <ChooseCloudSaveDialog open onClose={closeChoose} listSaves={listSaves} onChoose={chooseSave} />
          )}
        </Group>
      )}
      {cloud && (
        <>
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
        </>
      )}
      {cloudSaveOn && (
        <Group
          title={m.ratingCalculator_cloudSave_export_title({}, { locale })}
          description={m.ratingCalculator_cloudSave_export_description({}, { locale })}
        >
          <DownloadMyDataButton />
        </Group>
      )}
    </div>
  )
}