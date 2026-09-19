import { Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import IconMdiCogOutline from '~icons/mdi/cog-outline'
import { useNetImportSettings } from './NetImportSettingsContext'

export function NetImportSettingsButton() {
  const { t } = useTranslation()
  const { openSettings } = useNetImportSettings()
  return (
    <Button
      variant="outlined"
      startIcon={<IconMdiCogOutline />}
      aria-haspopup="dialog"
      onClick={(event) => openSettings(event.currentTarget)}
    >
      {t('rating-calculator:io.import.net-records.settings.button')}
    </Button>
  )
}