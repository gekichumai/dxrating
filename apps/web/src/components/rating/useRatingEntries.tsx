import type { VersionEnum } from '@gekichumai/dxdata'
import {
  calculateBest50,
  calculateRatingAward,
  getDxdataSongCatalog,
  type Best50Result,
  type RatingAward,
  type RatingEntry,
  type SongCatalog,
} from '@gekichumai/maimai-domain'
import * as Sentry from '@sentry/tanstackstart-react'
import { useMemo } from 'react'
import type { Region } from '../../models/context/AppContext'
import { useRatingCalculatorContext } from '../../models/context/RatingCalculatorContext'
import { useAppContext, useAppContextDXDataVersion } from '../../models/context/useAppContext'
import type { Entry } from '../../pages/RatingCalculator'
import { type FlattenedSheet, useSheets } from '../../songs'
import type { PlayEntry } from './RatingCalculatorAddEntryForm'

export type RatingCalculatorEntry = Entry & {
  sheet: FlattenedSheet
  rating: RatingAward | null
}
interface UseRatingEntriesReturn {
  allEntries: RatingCalculatorEntry[]
  b15Entries: RatingCalculatorEntry[]
  b35Entries: RatingCalculatorEntry[]
  statistics: UseRatingEntriesStatistics
}
interface UseRatingEntriesStatistics {
  b15Average: number
  b35Average: number
  b15Min: number
  b35Min: number
  b15Max: number
  b35Max: number
  b15Sum: number
  b35Sum: number
  b50Sum: number
}

interface NormalizedWebRatingEntry {
  originalEntry: PlayEntry
  sheet: FlattenedSheet
  ratingEntry: RatingEntry | null
}

export const calculateWebRatingEntries = ({
  entries,
  sheets,
  catalog,
  appVersion,
  region,
}: {
  entries: PlayEntry[]
  sheets: FlattenedSheet[] | undefined
  catalog: SongCatalog
  appVersion: VersionEnum
  region: Region
}): UseRatingEntriesReturn => {
  const sheetsById = new Map(sheets?.map((sheet) => [sheet.id, sheet]) ?? [])
  const normalizedEntries = entries.flatMap((entry): NormalizedWebRatingEntry[] => {
    const sheet = sheetsById.get(entry.sheetId)
    if (!sheet) return []

    const identity = entry.identity ?? catalog.getById(entry.sheetId)?.identity
    return [
      {
        originalEntry: entry,
        sheet,
        ratingEntry: identity
          ? {
              sheetId: entry.sheetId,
              identity,
              achievementRate: entry.achievementRate,
              comboFlag: entry.comboFlag,
              syncFlag: entry.syncFlag,
              source: entry.providerConfig?.divingFish?.ratingEligibility
                ? {
                    provider: 'diving-fish' as const,
                    best50Bucket: entry.providerConfig.divingFish.ratingEligibility,
                  }
                : undefined,
            }
          : null,
      },
    ]
  })

  const result = calculateBest50({
    catalog,
    version: appVersion,
    region,
    entries: normalizedEntries.flatMap((entry) => (entry.ratingEntry ? [entry.ratingEntry] : [])),
  })

  const resultByRatingEntry = new Map(result.allEntries.map((entry) => [entry.entry, entry]))
  const webEntries = normalizedEntries.map(({ originalEntry, sheet, ratingEntry }) => {
    const calculatedEntry = ratingEntry ? resultByRatingEntry.get(ratingEntry) : undefined
    return {
      ...originalEntry,
      sheet,
      rating: calculatedEntry?.rating ?? calculateFallbackRating(sheet, originalEntry),
      includedIn: calculatedEntry?.bucket ?? null,
    }
  })

  const b15Entries = webEntries.filter((entry) => entry.includedIn === 'b15')
  const b35Entries = webEntries.filter((entry) => entry.includedIn === 'b35')
  return {
    allEntries: webEntries,
    b15Entries,
    b35Entries,
    statistics: toWebStatistics(result.statistics, b15Entries.length, b35Entries.length),
  }
}

function calculateFallbackRating(sheet: FlattenedSheet, entry: PlayEntry): RatingAward | null {
  if (!sheet.isRatingEligible) return null
  return calculateRatingAward(sheet.internalLevelValue, entry.achievementRate, entry.comboFlag)
}

function toWebStatistics(
  statistics: Best50Result['statistics'],
  b15EntryCount: number,
  b35EntryCount: number,
): UseRatingEntriesStatistics {
  return {
    ...statistics,
    ...(b15EntryCount === 0
      ? {
          b15Average: Number.NaN,
          b15Min: Number.POSITIVE_INFINITY,
          b15Max: Number.NEGATIVE_INFINITY,
        }
      : {}),
    ...(b35EntryCount === 0
      ? {
          b35Average: Number.NaN,
          b35Min: Number.POSITIVE_INFINITY,
          b35Max: Number.NEGATIVE_INFINITY,
        }
      : {}),
  }
}

export const useRatingEntries = (): UseRatingEntriesReturn => {
  const appVersion = useAppContextDXDataVersion()
  const { region } = useAppContext()
  const { entries } = useRatingCalculatorContext()
  const { data: sheets } = useSheets({ acceptsPartialData: true })

  const { allEntries, b15Entries, b35Entries, statistics } = useMemo(() => {
    const computeStart = performance.now()
    const catalog = getDxdataSongCatalog(appVersion)

    const result = calculateWebRatingEntries({
      entries,
      sheets,
      catalog,
      appVersion,
      region,
    })

    Sentry.metrics.distribution('rating_calculation.duration', performance.now() - computeStart, {
      unit: 'millisecond',
      attributes: { entry_count: String(entries.length) },
    })

    return result
  }, [entries, sheets, appVersion, region])

  return { allEntries, b15Entries, b35Entries, statistics }
}