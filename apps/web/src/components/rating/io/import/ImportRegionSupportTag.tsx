import type { FC } from 'react'
import type { Region } from '../../../../models/context/AppContext'

export const ImportRegionSupportTag: FC<{
  region: Region
}> = ({ region }) => {
  return (
    <div className="text-xs bg-green-200 text-green-800 rounded-full px-1.5 py-1 inline-flex leading-none font-mono font-medium">
      {region.toUpperCase()}
    </div>
  )
}
