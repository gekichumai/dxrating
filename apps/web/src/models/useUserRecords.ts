import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { useEffect, useMemo, useState } from 'react'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { useSongCatalog } from '@/catalog/CatalogContext'
import { buildDemoScores, isDemoScoresEnabled } from '@/fixtures/demoScores'
import { useRatingCalculatorContext } from './context/RatingCalculatorContext'

export interface UserRecord {
  entry: PlayEntry
  /** The catalog sheet of the record; null while the catalog lacks it */
  sheet: VersionedSheet | null
}

export interface UserRecords {
  /** Raw entries, in the stored shape */
  entries: readonly PlayEntry[]
  /** Records joined with their sheets, keyed by public sheet ID (best achievement wins on duplicates) */
  bySheetId: ReadonlyMap<string, UserRecord>
  records: readonly UserRecord[]
  /** The fixture of `?demoScores=1` is shown instead of the user's own scores */
  isDemo: boolean
}

/**
 * The single read path for the user's scores. Feature code must read records through this hook only: its backing
 * store (localStorage today) is about to move to a cloud score repository, keeping the `PlayEntry` shape.
 */
export function useUserRecords(): UserRecords {
  const { entries: storedEntries } = useRatingCalculatorContext()
  const catalog = useSongCatalog()
  // Read after mount so the first client render matches the server one
  const [isDemo, setIsDemo] = useState(false)
  useEffect(() => {
    setIsDemo(isDemoScoresEnabled(window.location.href))
  }, [])

  const entries = useMemo(() => (isDemo ? buildDemoScores(catalog) : storedEntries), [isDemo, catalog, storedEntries])

  return useMemo(() => {
    const bySheetId = new Map<string, UserRecord>()
    for (const entry of entries) {
      const existing = bySheetId.get(entry.sheetId)
      if (existing && existing.entry.achievementRate >= entry.achievementRate) continue
      bySheetId.set(entry.sheetId, { entry, sheet: catalog.getById(entry.sheetId) })
    }
    return { entries, bySheetId, records: [...bySheetId.values()], isDemo }
  }, [entries, catalog, isDemo])
}