import { Alert, AlertTitle } from '@mui/material'
import { type FC, useState } from 'react'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const dismissedKey = (region: 'intl' | 'jp') => `net-maintenance-notice-dismissed:${region}`

const readDismissed = (region: 'intl' | 'jp') => {
  try {
    return sessionStorage.getItem(dismissedKey(region)) === '1'
  } catch {
    return false
  }
}

/** Shown before anyone types credentials while SEGA has the region in maintenance; dismissed for the browser session */
export const NetMaintenanceNotice: FC<{ region: 'intl' | 'jp'; maintenance: boolean }> = ({ region, maintenance }) => {
  const locale = useLocale()
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  if (!maintenance || dismissed[region] || readDismissed(region)) return null

  return (
    <Alert
      severity="warning"
      onClose={() => {
        try {
          sessionStorage.setItem(dismissedKey(region), '1')
        } catch {
          // storage unavailable: dismissed until the dialog closes
        }
        setDismissed((current) => ({ ...current, [region]: true }))
      }}
    >
      <AlertTitle>
        {m.ratingCalculator_io_import_netRecords_maintenanceNotice_title(
          {
            region:
              region === 'intl'
                ? m.ratingCalculator_io_import_netRecords_dialog_region_intl_name({}, { locale })
                : m.ratingCalculator_io_import_netRecords_dialog_region_jp_name({}, { locale }),
          },
          { locale },
        )}
      </AlertTitle>
      {m.ratingCalculator_io_import_netRecords_maintenanceNotice_description({}, { locale })}
    </Alert>
  )
}