import { DXVersionToDXDataVersionEnumMap } from '@/models/context/AppContext'
import { useAppContext } from '@/models/context/useAppContext'
import { useTranslation } from 'react-i18next'
import { startViewTransition } from '@/utils/startViewTransition'
import { ConfirmDialog } from '../ConfirmDialog'

export function RegionVersionUpdatePrompt() {
  const { t } = useTranslation(['settings'])
  const { version, region, availableVersionUpdate, dismissVersionUpdate, setVersionAndRegion } = useAppContext()
  if (!availableVersionUpdate) return null

  const current = DXVersionToDXDataVersionEnumMap[version]
  const latest = DXVersionToDXDataVersionEnumMap[availableVersionUpdate]
  return (
    <ConfirmDialog
      open
      title={t('settings:version-update.title')}
      description={t('settings:version-update.description', {
        region: t(`settings:region.${region}`),
        current,
        latest,
      })}
      confirmLabel={t('settings:version-update.confirm', { latest })}
      cancelLabel={t('settings:version-update.keep', { current })}
      confirmColor="primary"
      onCancel={dismissVersionUpdate}
      onConfirm={() => {
        void startViewTransition(() => setVersionAndRegion(availableVersionUpdate, region))
      }}
    />
  )
}