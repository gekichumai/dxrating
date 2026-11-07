import { DifficultyEnum, TypeEnum, VERSION_SORT_ORDER, type VersionEnum } from '@gekichumai/dxdata'
import type { Region, VersionedSheet } from '@gekichumai/maimai-domain'
import { DEFAULT_LEVEL_RANGE, type LevelRange, RANGE_CEILING, RANGE_FLOOR_EXTENDED, toTenths } from './levelRange'

export const RANDOM_TYPES = [TypeEnum.DX, TypeEnum.STD] as const
export const RANDOM_DIFFICULTIES = [
  DifficultyEnum.Basic,
  DifficultyEnum.Advanced,
  DifficultyEnum.Expert,
  DifficultyEnum.Master,
  DifficultyEnum.ReMaster,
] as const

export interface RandomChartFilters {
  /** Empty means every type */
  types: readonly TypeEnum[]
  /** Empty means every difficulty */
  difficulties: readonly DifficultyEnum[]
  /** Internal levels, inclusive, in tenths */
  range: LevelRange
  /** Empty means every version */
  versions: readonly VersionEnum[]
}

export const DEFAULT_RANDOM_FILTERS: RandomChartFilters = {
  types: [],
  difficulties: [],
  range: DEFAULT_LEVEL_RANGE,
  versions: [],
}

/** Number of filters that narrow the pool, for analytics */
export const countActiveFilters = (filters: RandomChartFilters): number =>
  (filters.types.length > 0 ? 1 : 0) +
  (filters.difficulties.length > 0 ? 1 : 0) +
  (filters.versions.length > 0 ? 1 : 0) +
  (filters.range.min > RANGE_FLOOR_EXTENDED || filters.range.max < RANGE_CEILING ? 1 : 0)

export function filterRandomPool(
  sheets: readonly VersionedSheet[],
  filters: RandomChartFilters,
  region: Region,
  /** The selected game version: charts introduced after it do not exist there */
  maxVersion?: VersionEnum,
): VersionedSheet[] {
  const maxVersionIndex = maxVersion ? VERSION_SORT_ORDER.indexOf(maxVersion) : -1
  const types = new Set<string>(filters.types)
  const difficulties = new Set<string>(filters.difficulties)
  const versions = new Set<string>(filters.versions)
  const { min, max } = filters.range
  return sheets.filter(
    (sheet) =>
      !sheet.isTypeUtage &&
      (region === '_generic' || sheet.serverIds.includes(region)) &&
      (types.size === 0 || types.has(sheet.type)) &&
      (difficulties.size === 0 || difficulties.has(sheet.difficulty)) &&
      (versions.size === 0 || versions.has(sheet.version)) &&
      (maxVersionIndex < 0 || VERSION_SORT_ORDER.indexOf(sheet.version) <= maxVersionIndex) &&
      // Compared in tenths, so 13.7 is never lost to floating point
      toTenths(sheet.internalLevelValue) >= min &&
      toTenths(sheet.internalLevelValue) <= max,
  )
}

export function pickRandom<T>(pool: readonly T[], random: () => number = Math.random): T | null {
  if (pool.length === 0) return null
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null
}
/** A public sheet ID (dsht_…) from `?chart=`, or undefined */
export const parseRolledChartParam = (value: unknown): string | undefined =>
  typeof value === 'string' && /^dsht_[A-Za-z0-9]{1,32}$/.test(value) ? value : undefined

/** The chart a `?chart=` link names, or null when the catalog has no such sheet */
export const findRolledChart = <S extends { id: string }>(sheets: readonly S[], id: string | undefined): S | null =>
  (id && sheets.find((sheet) => sheet.id === id)) || null