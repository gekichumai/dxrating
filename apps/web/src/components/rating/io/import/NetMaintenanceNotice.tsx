import { Alert, AlertTitle } from '@mui/material'
import { type FC, useState } from 'react'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { persisted } from '@/utils/persisted'
import { z } from 'zod'

const noticeDismissed = (region: 'intl' | 'jp') =>
  persisted(`net-maintenance-notice-dismissed:${region}`, z.literal('1'), null, { area: 'session', format: 'text' })

/** Shown before anyone types credentials while SEGA has the region in maintenance; dismissed for the browser session */
export const NetMaintenanceNotice: FC<{ region: 'intl' | 'jp'; maintenance: boolean }> = ({ region, maintenance }) => {
  const locale = useLocale()
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  if (!maintenance || dismissed[region] || noticeDismissed(region).get() === '1') return null

  return (
    <Alert
      severity="warning"
      onClose={() => {
        noticeDismissed(region).set('1')
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