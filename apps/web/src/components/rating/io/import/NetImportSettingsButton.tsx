import { Button } from '@mui/material'
import IconMdiConnection from '~icons/mdi/connection'
import { useNetImportSettings } from './NetImportSettingsContext'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export function NetImportSettingsButton() {
  const locale = useLocale()
  const { openSettings } = useNetImportSettings()
  return (
    <Button
      variant="outlined"
      startIcon={<IconMdiConnection />}
      aria-haspopup="dialog"
      onClick={(event) => openSettings(event.currentTarget)}
    >
      {/* The same name as the Import menu's item: both open the one maimai NET dialog (import and auto-import) */}
      {m.ratingCalculator_io_import_netRecords_title({}, { locale })}
    </Button>
  )
}