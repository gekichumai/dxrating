import { Alert, AlertTitle } from '@mui/material'
import { type FC, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation(['rating-calculator'])
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
        {t('rating-calculator:io.import.net-records.maintenance-notice.title', {
          region: t(`rating-calculator:io.import.net-records.dialog.region.${region}.name`),
        })}
      </AlertTitle>
      {t('rating-calculator:io.import.net-records.maintenance-notice.description')}
    </Alert>
  )
}