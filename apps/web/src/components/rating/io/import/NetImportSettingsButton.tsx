import { Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import IconMdiConnection from '~icons/mdi/connection'
import { useNetImportSettings } from './NetImportSettingsContext'

export function NetImportSettingsButton() {
  const { t } = useTranslation()
  const { openSettings } = useNetImportSettings()
  return (
    <Button
      variant="outlined"
      startIcon={<IconMdiConnection />}
      aria-haspopup="dialog"
      onClick={(event) => openSettings(event.currentTarget)}
    >
      {/* The same name as the Import menu's item: both open the one maimai NET dialog (import and auto-import) */}
      {t('rating-calculator:io.import.net-records.title')}
    </Button>
  )
}