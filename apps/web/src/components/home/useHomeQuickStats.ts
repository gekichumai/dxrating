import {
  calculateBest50,
  evaluatePlate,
  listPlates,
  type PlateDefinition,
  type PlateRegion,
  type SongCatalog,
} from '@gekichumai/maimai-domain'
import type { Song, VersionEnum } from '@gekichumai/dxdata'
import { useMemo } from 'react'
import { useCompleteCatalogDocument, useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import type { Region } from '@/models/context/AppContext'
import { type UserRecords, useUserRecords } from '@/models/useUserRecords'

export interface HomeQuickStats {
  rating: number
  /** Lowest rating in the B35 (current-version entries are in B15); null while the bucket is empty */
  b35Floor: number | null
  b15Floor: number | null
  nearestPlate: {
    plate: PlateDefinition
    /** The server the progress was computed for; the plate link must open the same one */
    region: PlateRegion
    completedSheets: number
    totalSheets: number
  } | null
  isDemo: boolean
}

/** Client-only summary of the user's scores; null when there are none */
export function useHomeQuickStats(): HomeQuickStats | null {
  const { records, ratingEntries, isDemo } = useUserRecords()
  // The complete catalog only: the page's slice would undercount plates and the B50
  const catalog = useCompleteSongCatalog()
  const document = useCompleteCatalogDocument()
  const version = useAppContextDXDataVersion()
  const { region } = useAppContext()

  return useMemo(
    () =>
      catalog && document
        ? computeHomeQuickStats({ records, ratingEntries, isDemo, catalog, songs: document.songs, version, region })
        : null,
    [records, ratingEntries, isDemo, catalog, document, version, region],
  )
}

export function computeHomeQuickStats({
  records,
  ratingEntries,
  isDemo,
  catalog,
  songs,
  version,
  region,
}: {
  records: UserRecords['records']
  ratingEntries: UserRecords['ratingEntries']
  isDemo: boolean
  catalog: SongCatalog
  songs: readonly Song[]
  version: VersionEnum
  region: Region
}): HomeQuickStats | null {
  if (records.length === 0) return null
  const best50 = calculateBest50({ catalog, version, region, entries: ratingEntries })
  const finite = (value: number) => (Number.isFinite(value) && value > 0 ? value : null)

  const plateRegion: PlateRegion = region === 'cn' || region === 'intl' ? region : 'jp'
  const plateRecords = new Map(records.map(({ entry, best }) => [entry.sheetId, best]))
  let nearestPlate: HomeQuickStats['nearestPlate'] = null
  let bestRatio = -1
  for (const plate of listPlates(plateRegion)) {
    const progress = evaluatePlate({ songs, plate, region: plateRegion, records: plateRecords })
    if (progress.totalSheets === 0 || progress.completedSheets >= progress.totalSheets) continue
    const ratio = progress.completedSheets / progress.totalSheets
    if (ratio > bestRatio) {
      bestRatio = ratio
      nearestPlate = {
        plate,
        region: plateRegion,
        completedSheets: progress.completedSheets,
        totalSheets: progress.totalSheets,
      }
    }
  }

  return {
    rating: best50.statistics.b50Sum,
    b15Floor: finite(best50.statistics.b15Min),
    b35Floor: finite(best50.statistics.b35Min),
    nearestPlate: bestRatio > 0 ? nearestPlate : null,
    isDemo,
  }
}