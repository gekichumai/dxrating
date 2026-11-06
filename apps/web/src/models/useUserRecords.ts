import type { RatingEntry } from '@gekichumai/maimai-domain'
import { useEffect, useMemo, useState } from 'react'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { useSongCatalog } from '@/catalog/CatalogContext'
import { buildDemoScores, isDemoScoresEnabled } from '@/fixtures/demoScores'
import { useRatingCalculatorContext } from './context/RatingCalculatorContext'
import { groupUserRecords, toRatingEntries, type UserRecord } from './userRecords'

export type { UserRecord } from './userRecords'

export interface UserRecords {
  /** Raw entries, in the stored shape */
  entries: readonly PlayEntry[]
  /**
   * Every entry as `calculateBest50` input, duplicates and import bucket hints kept: B50 must be computed from this,
   * never from `records` (B50 deduplicates by rating, AP bonus included, not by achievement)
   */
  ratingEntries: RatingEntry[]
  /** Records joined with their sheets, keyed by public sheet ID (see `UserRecord` for duplicate handling) */
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
  // Saved scores (localStorage) and demo mode are read after mount, so the first client render matches the server's
  // empty one; the backing store itself is untouched
  const [mounted, setMounted] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  useEffect(() => {
    setIsDemo(isDemoScoresEnabled(window.location.href))
    setMounted(true)
  }, [])

  const entries = useMemo(
    () => (!mounted ? EMPTY : isDemo ? buildDemoScores(catalog) : storedEntries),
    [mounted, isDemo, catalog, storedEntries],
  )

  return useMemo(() => {
    const bySheetId = groupUserRecords(entries, (sheetId) => catalog.getById(sheetId))
    return {
      entries,
      ratingEntries: toRatingEntries(entries, catalog),
      bySheetId,
      records: [...bySheetId.values()],
      isDemo,
    }
  }, [entries, catalog, isDemo])
}

const EMPTY: readonly PlayEntry[] = []