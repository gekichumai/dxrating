import {
  calculateBest50,
  evaluatePlate,
  listPlates,
  type PlateDefinition,
  type PlateRegion,
  type RatingEntry,
} from '@gekichumai/maimai-domain'
import { useMemo } from 'react'
import { useCompleteCatalogDocument, useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { useUserRecords } from '@/models/useUserRecords'

export interface HomeQuickStats {
  rating: number
  /** Lowest rating in the B35 (current-version entries are in B15); null while the bucket is empty */
  b35Floor: number | null
  b15Floor: number | null
  nearestPlate: { plate: PlateDefinition; completedSheets: number; totalSheets: number } | null
  isDemo: boolean
}

/** Client-only summary of the user's scores; null when there are none */
export function useHomeQuickStats(): HomeQuickStats | null {
  const { records, isDemo } = useUserRecords()
  // The complete catalog only: the page's slice would undercount plates and the B50
  const catalog = useCompleteSongCatalog()
  const document = useCompleteCatalogDocument()
  const version = useAppContextDXDataVersion()
  const { region } = useAppContext()

  return useMemo(() => {
    if (records.length === 0 || !catalog || !document) return null
    const entries = records.flatMap(({ entry, sheet }): RatingEntry[] => {
      const identity = entry.identity ?? sheet?.identity
      return identity
        ? [
            {
              sheetId: entry.sheetId,
              identity,
              achievementRate: entry.achievementRate,
              comboFlag: entry.comboFlag,
              syncFlag: entry.syncFlag,
            },
          ]
        : []
    })
    const best50 = calculateBest50({ catalog, version, region, entries })
    const finite = (value: number) => (Number.isFinite(value) && value > 0 ? value : null)

    const plateRegion: PlateRegion = region === 'cn' || region === 'intl' ? region : 'jp'
    const plateRecords = new Map(records.map(({ entry }) => [entry.sheetId, entry]))
    let nearestPlate: HomeQuickStats['nearestPlate'] = null
    let bestRatio = -1
    for (const plate of listPlates(plateRegion)) {
      const progress = evaluatePlate({ songs: document.songs, plate, region: plateRegion, records: plateRecords })
      if (progress.totalSheets === 0 || progress.completedSheets >= progress.totalSheets) continue
      const ratio = progress.completedSheets / progress.totalSheets
      if (ratio > bestRatio) {
        bestRatio = ratio
        nearestPlate = { plate, completedSheets: progress.completedSheets, totalSheets: progress.totalSheets }
      }
    }

    return {
      rating: best50.statistics.b50Sum,
      b15Floor: finite(best50.statistics.b15Min),
      b35Floor: finite(best50.statistics.b35Min),
      nearestPlate: bestRatio > 0 ? nearestPlate : null,
      isDemo,
    }
  }, [records, isDemo, catalog, document, version, region])
}
