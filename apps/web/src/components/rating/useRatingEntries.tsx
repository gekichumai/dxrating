import { VERSION_ID_MAP, type VersionEnum } from '@gekichumai/dxdata'
import { useMemo } from 'react'
import type { Region } from '../../models/context/AppContext'
import { useRatingCalculatorContext } from '../../models/context/RatingCalculatorContext'
import { useAppContext, useAppContextDXDataVersion } from '../../models/context/useAppContext'
import type { Entry } from '../../pages/RatingCalculator'
import { type FlattenedSheet, useSheets } from '../../songs'
import { calculateRating, type Rating } from '../../utils/rating'

export type RatingCalculatorEntry = Entry & {
  sheet: FlattenedSheet
  rating: Rating | null
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

const filterB15 = (sheet: FlattenedSheet, appVersion: VersionEnum, region: Region) => {
  if (region === '_generic') return sheet.version === appVersion

  const appVersionId = VERSION_ID_MAP.get(appVersion)
  const sheetVersionId = VERSION_ID_MAP.get(sheet.version)
  if (appVersionId !== undefined && sheetVersionId !== undefined) {
    return sheetVersionId === appVersionId && sheet.regions[region]
  }
  return false
}

const filterB35Extra = (sheet: FlattenedSheet, appVersion: VersionEnum, region: Region) => {
  if (region === '_generic') return sheet.version !== appVersion

  const appVersionId = VERSION_ID_MAP.get(appVersion)
  const sheetVersionId = VERSION_ID_MAP.get(sheet.version)
  if (appVersionId !== undefined && sheetVersionId !== undefined) {
    return sheetVersionId < appVersionId && sheet.regions[region]
  }
  return false
}

export const useRatingEntries = (): UseRatingEntriesReturn => {
  const appVersion = useAppContextDXDataVersion()
  const { region } = useAppContext()
  const { entries } = useRatingCalculatorContext()
  const { data: sheets } = useSheets()

  const { allEntries, b15Entries, b35Entries } = useMemo(() => {
    const calculated = entries.flatMap((entry) => {
      const sheet = sheets?.find((sheet) => sheet.id === entry.sheetId)
      if (!sheet) {
        return []
      }

      return [
        {
          ...entry,
          sheet,
          rating: sheet.isRatingEligible ? calculateRating(sheet.internalLevelValue, entry.achievementRate) : null,
        },
      ]
    })

    const best15OfCurrentVersionSheetIds = calculated
      .filter((entry) => filterB15(entry.sheet, appVersion, region))
      // a.rating and b.rating could be null. put them at the end
      .sort((a, b) => {
        if (!a.rating) return 1
        if (!b.rating) return -1
        return b.rating.ratingAwardValue - a.rating.ratingAwardValue
      })
      .slice(0, 15)
      .map((entry) => entry.sheetId)

    const best35OfAllOtherVersionSheetIds = calculated
      .filter((entry) => !filterB15(entry.sheet, appVersion, region) && filterB35Extra(entry.sheet, appVersion, region))
      .sort((a, b) => {
        if (!a.rating) return 1
        if (!b.rating) return -1
        return b.rating.ratingAwardValue - a.rating.ratingAwardValue
      })
      .slice(0, 35)
      .map((entry) => entry.sheetId)

    const calculatedEntries = calculated.map((entry) => ({
      ...entry,
      includedIn:
        best15OfCurrentVersionSheetIds.includes(entry.sheetId) ||
        (region === 'cn' && entry.providerConfig?.divingFish?.ratingEligibility === 'b15')
          ? ('b15' as const)
          : best35OfAllOtherVersionSheetIds.includes(entry.sheetId) ||
              (region === 'cn' && entry.providerConfig?.divingFish?.ratingEligibility === 'b35')
            ? ('b35' as const)
            : null,
    }))

    return {
      allEntries: calculatedEntries,
      b15Entries: calculatedEntries.filter((entry) => entry.includedIn === 'b15'),
      b35Entries: calculatedEntries.filter((entry) => entry.includedIn === 'b35'),
    }
  }, [entries, sheets, appVersion, region])

  const statistics = useMemo(() => {
    const eligibleRatingEntriesB15 = b15Entries.filter((entry) => entry.rating)
    const eligibleRatingEntriesB35 = b35Entries.filter((entry) => entry.rating)

    const b15Average =
      eligibleRatingEntriesB15.reduce((acc, entry) => acc + entry.rating!.ratingAwardValue, 0) / b15Entries.length

    const b35Average =
      eligibleRatingEntriesB35.reduce((acc, entry) => acc + entry.rating!.ratingAwardValue, 0) / b35Entries.length

    const b15Min = Math.min(...eligibleRatingEntriesB15.map((entry) => entry.rating!.ratingAwardValue))
    const b35Min = Math.min(...eligibleRatingEntriesB35.map((entry) => entry.rating!.ratingAwardValue))

    const b15Max = Math.max(...eligibleRatingEntriesB15.map((entry) => entry.rating!.ratingAwardValue))
    const b35Max = Math.max(...eligibleRatingEntriesB35.map((entry) => entry.rating!.ratingAwardValue))

    const b15Sum = eligibleRatingEntriesB15.reduce((acc, entry) => acc + entry.rating!.ratingAwardValue, 0)
    const b35Sum = eligibleRatingEntriesB35.reduce((acc, entry) => acc + entry.rating!.ratingAwardValue, 0)

    const b50Sum = b15Sum + b35Sum

    return {
      b15Average,
      b35Average,
      b15Min,
      b35Min,
      b15Max,
      b35Max,
      b15Sum,
      b35Sum,
      b50Sum,
    }
  }, [b15Entries, b35Entries])

  return { allEntries, b15Entries, b35Entries, statistics }
}
