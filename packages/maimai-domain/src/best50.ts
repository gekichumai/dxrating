import { VERSION_ID_MAP, VersionEnum, type VersionEnum as Version } from '@gekichumai/dxdata'
import type { SongCatalog } from './song-catalog.js'
import type { Best50Bucket, ComboFlag, RatingEntry, Region, VersionedSheet } from './types.js'

export type RatingRank =
  | 'd'
  | 'c'
  | 'b'
  | 'bb'
  | 'bbb'
  | 'a'
  | 'aa'
  | 'aaa'
  | 's'
  | 'sp'
  | 'ss'
  | 'ssp'
  | 'sss'
  | 'sssp'

export const SCORE_COEFFICIENT_TABLE: [number, number, RatingRank][] = [
  [0, 0, 'd'],
  [10, 1.6, 'd'],
  [20, 3.2, 'd'],
  [30, 4.8, 'd'],
  [40, 6.4, 'd'],
  [50, 8, 'c'],
  [60, 9.6, 'b'],
  [70, 11.2, 'bb'],
  [75, 12.0, 'bbb'],
  [79.9999, 12.8, 'bbb'],
  [80, 13.6, 'a'],
  [90, 15.2, 'aa'],
  [94, 16.8, 'aaa'],
  [96.9999, 17.6, 'aaa'],
  [97, 20, 's'],
  [98, 20.3, 'sp'],
  [98.9999, 20.6, 'sp'],
  [99, 20.8, 'ss'],
  [99.5, 21.1, 'ssp'],
  [99.9999, 21.4, 'ssp'],
  [100, 21.6, 'sss'],
  [100.4999, 22.2, 'sss'],
  [100.5, 22.4, 'sssp'],
]

export interface RatingAward {
  ratingAwardValue: number
  coefficient: number
  rank: RatingRank
  index: number
}

export interface CalculatedRatingEntry {
  entry: RatingEntry
  sheet: VersionedSheet
  rating: RatingAward
  bucket: 'b15' | 'b35' | null
}

interface BucketAwareCalculatedRatingEntry extends CalculatedRatingEntry {
  authoritativeBest50Hint: AuthoritativeBest50Hint | null
}

interface AuthoritativeBest50Hint {
  bucket: Best50Bucket
  rating: RatingAward
  achievementRate: number
}

export interface Best50Result {
  allEntries: CalculatedRatingEntry[]
  b15: CalculatedRatingEntry[]
  b35: CalculatedRatingEntry[]
  statistics: {
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
}

export function calculateRatingAward(
  internalLevel: number,
  achievementRate: number,
  comboFlag?: ComboFlag,
): RatingAward {
  for (let i = 0; i < SCORE_COEFFICIENT_TABLE.length; i++) {
    if (i === SCORE_COEFFICIENT_TABLE.length - 1 || achievementRate < SCORE_COEFFICIENT_TABLE[i + 1]![0]) {
      const coefficient = SCORE_COEFFICIENT_TABLE[i]![1]
      const apBonus = comboFlag === 'ap' || comboFlag === 'app' ? 1 : 0
      return {
        ratingAwardValue: Math.floor((coefficient * internalLevel * Math.min(100.5, achievementRate)) / 100) + apBonus,
        coefficient,
        rank: SCORE_COEFFICIENT_TABLE[i]![2],
        index: i,
      }
    }
  }
  return { ratingAwardValue: 0, coefficient: 0, rank: 'd', index: 99 }
}

export function calculateBest50({
  catalog,
  version,
  region,
  entries,
}: {
  catalog: SongCatalog
  version: Version
  region: Region
  entries: RatingEntry[]
}): Best50Result {
  const calculated = deduplicateEntries(
    entries.flatMap((entry): BucketAwareCalculatedRatingEntry[] => {
      const sheet = catalog.getById(entry.sheetId)
      if (!sheet || !sheet.isRatingEligible || !isAvailableInRegion(sheet.regions, region)) return []
      const rating = calculateRatingAward(sheet.internalLevelValue, entry.achievementRate, entry.comboFlag)
      return [
        {
          entry,
          sheet,
          rating,
          bucket: null,
          authoritativeBest50Hint: getAuthoritativeBest50Hint(entry, rating, region),
        },
      ]
    }),
  )

  const b15Ids = new Set(
    calculated
      .filter((entry) => getEntryBucket(entry, version, region) === 'b15')
      .sort(byRatingDesc)
      .slice(0, 15)
      .map((entry) => entry.entry.sheetId),
  )

  const b35Ids = new Set(
    calculated
      .filter((entry) => !b15Ids.has(entry.entry.sheetId))
      .filter((entry) => getEntryBucket(entry, version, region) === 'b35')
      .sort(byRatingDesc)
      .slice(0, 35)
      .map((entry) => entry.entry.sheetId),
  )

  const allEntries = calculated.map(
    (entry): CalculatedRatingEntry => ({
      entry: entry.entry,
      sheet: entry.sheet,
      rating: entry.rating,
      bucket: b15Ids.has(entry.entry.sheetId)
        ? ('b15' as const)
        : b35Ids.has(entry.entry.sheetId)
          ? ('b35' as const)
          : null,
    }),
  )
  const b15 = allEntries.filter((entry) => entry.bucket === 'b15').sort(byRatingDesc)
  const b35 = allEntries.filter((entry) => entry.bucket === 'b35').sort(byRatingDesc)
  return { allEntries, b15, b35, statistics: calculateStatistics(b15, b35) }
}

function isAvailableInRegion(regions: { jp: boolean; intl: boolean; cn: boolean }, region: Region): boolean {
  return region === '_generic' || regions[region]
}

function getEntryBucket(
  entry: BucketAwareCalculatedRatingEntry,
  appVersion: Version,
  region: Region,
): Best50Bucket | null {
  if (entry.authoritativeBest50Hint) return entry.authoritativeBest50Hint.bucket
  if (isB15Sheet(entry.sheet.version, appVersion, region)) return 'b15'
  if (isB35Sheet(entry.sheet.version, appVersion, region)) return 'b35'
  return null
}

function getAuthoritativeBest50Hint(
  entry: RatingEntry,
  rating: RatingAward,
  region: Region,
): AuthoritativeBest50Hint | null {
  return hasAuthoritativeBucketHint(entry, region)
    ? { bucket: entry.source.best50Bucket, rating, achievementRate: entry.achievementRate }
    : null
}

function hasAuthoritativeBucketHint(
  entry: RatingEntry,
  region: Region,
): entry is RatingEntry & {
  source: NonNullable<RatingEntry['source']> & { provider: 'diving-fish'; best50Bucket: Best50Bucket }
} {
  return region === 'cn' && entry.source?.provider === 'diving-fish' && entry.source.best50Bucket !== undefined
}

function isB15Sheet(sheetVersion: Version, appVersion: Version, region: Region): boolean {
  if (region === '_generic') return sheetVersion === appVersion
  const appVersionId = VERSION_ID_MAP.get(appVersion)
  const sheetVersionId = VERSION_ID_MAP.get(sheetVersion)
  if (appVersionId === undefined || sheetVersionId === undefined) return false
  const useCircleB15 = appVersionId >= VERSION_ID_MAP.get(VersionEnum.CiRCLE)!
  return useCircleB15
    ? appVersionId === sheetVersionId || appVersionId === sheetVersionId + 1
    : appVersionId === sheetVersionId
}

function isB35Sheet(sheetVersion: Version, appVersion: Version, region: Region): boolean {
  const appVersionId = VERSION_ID_MAP.get(appVersion)
  const sheetVersionId = VERSION_ID_MAP.get(sheetVersion)
  if (appVersionId === undefined || sheetVersionId === undefined) return false
  if (region === '_generic') return appVersionId > sheetVersionId
  const useCircleB15 = appVersionId >= VERSION_ID_MAP.get(VersionEnum.CiRCLE)!
  return useCircleB15 ? appVersionId > sheetVersionId + 1 : appVersionId > sheetVersionId
}

function byRatingDesc(a: CalculatedRatingEntry, b: CalculatedRatingEntry): number {
  return b.rating.ratingAwardValue - a.rating.ratingAwardValue || b.entry.achievementRate - a.entry.achievementRate
}

function deduplicateEntries(entries: BucketAwareCalculatedRatingEntry[]): BucketAwareCalculatedRatingEntry[] {
  const bestBySheetId = new Map<string, BucketAwareCalculatedRatingEntry>()
  for (const entry of entries) {
    const existing = bestBySheetId.get(entry.entry.sheetId)

    if (!existing) {
      bestBySheetId.set(entry.entry.sheetId, entry)
      continue
    }

    const selected = byRatingDesc(entry, existing) < 0 ? entry : existing
    bestBySheetId.set(entry.entry.sheetId, {
      ...selected,
      authoritativeBest50Hint: chooseAuthoritativeBest50Hint(
        existing.authoritativeBest50Hint,
        entry.authoritativeBest50Hint,
      ),
    })
  }
  return Array.from(bestBySheetId.values())
}

function chooseAuthoritativeBest50Hint(
  a: AuthoritativeBest50Hint | null,
  b: AuthoritativeBest50Hint | null,
): AuthoritativeBest50Hint | null {
  if (!a) return b
  if (!b) return a
  const ratingDelta = b.rating.ratingAwardValue - a.rating.ratingAwardValue
  if (ratingDelta !== 0) return ratingDelta > 0 ? b : a
  const achievementDelta = b.achievementRate - a.achievementRate
  if (achievementDelta !== 0) return achievementDelta > 0 ? b : a
  return b.bucket === 'b15' ? b : a
}

function calculateStatistics(b15: CalculatedRatingEntry[], b35: CalculatedRatingEntry[]): Best50Result['statistics'] {
  const b15Values = b15.map((entry) => entry.rating.ratingAwardValue)
  const b35Values = b35.map((entry) => entry.rating.ratingAwardValue)
  const b15Sum = b15Values.reduce((sum, value) => sum + value, 0)
  const b35Sum = b35Values.reduce((sum, value) => sum + value, 0)
  return {
    b15Average: b15.length === 0 ? 0 : b15Sum / b15.length,
    b35Average: b35.length === 0 ? 0 : b35Sum / b35.length,
    b15Min: b15Values.length === 0 ? 0 : Math.min(...b15Values),
    b35Min: b35Values.length === 0 ? 0 : Math.min(...b35Values),
    b15Max: b15Values.length === 0 ? 0 : Math.max(...b15Values),
    b35Max: b35Values.length === 0 ? 0 : Math.max(...b35Values),
    b15Sum,
    b35Sum,
    b50Sum: b15Sum + b35Sum,
  }
}