import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import type { Region } from '../../../../models/context/AppContext'

export const ImportRegionSupportTag: FC<{
  region: Region
  maintenance?: boolean
}> = ({ region, maintenance = false }) => {
  const { t } = useTranslation(['rating-calculator'])
  return (
    <div
      className={`text-xs ${maintenance ? 'bg-amber-200 text-amber-900' : 'bg-green-200 text-green-800'} rounded-full px-1.5 py-1 inline-flex gap-1 leading-none font-mono font-medium`}
    >
      {region.toUpperCase()}
      {maintenance && (
        <span className="font-sans">{t('rating-calculator:io.import.net-records.maintenance-notice.tag')}</span>
      )}
    </div>
  )
}