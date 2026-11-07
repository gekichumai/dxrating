import type { FC } from 'react'
import type { Region } from '../../../../models/context/AppContext'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const ImportRegionSupportTag: FC<{
  region: Region
  maintenance?: boolean
}> = ({ region, maintenance = false }) => {
  const locale = useLocale()
  return (
    <span
      className={`text-xs ${maintenance ? 'bg-amber-200 text-amber-900' : 'bg-green-200 text-green-800'} rounded-full px-1.5 py-1 inline-flex gap-1 leading-none font-semibold`}
    >
      {region.toUpperCase()}
      {maintenance && (
        <span className="font-sans">
          {m.ratingCalculator_io_import_netRecords_maintenanceNotice_tag({}, { locale })}
        </span>
      )}
    </span>
  )
}