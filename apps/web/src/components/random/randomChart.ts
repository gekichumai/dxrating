import { DifficultyEnum, TypeEnum, type VersionEnum } from '@gekichumai/dxdata'
import type { Region, VersionedSheet } from '@gekichumai/maimai-domain'

export const RANDOM_TYPES = [TypeEnum.DX, TypeEnum.STD] as const
export const RANDOM_DIFFICULTIES = [
  DifficultyEnum.Basic,
  DifficultyEnum.Advanced,
  DifficultyEnum.Expert,
  DifficultyEnum.Master,
  DifficultyEnum.ReMaster,
] as const

export const RANDOM_LEVEL_MIN = 1
export const RANDOM_LEVEL_MAX = 15

export interface RandomChartFilters {
  /** Empty means every type */
  types: readonly TypeEnum[]
  /** Empty means every difficulty */
  difficulties: readonly DifficultyEnum[]
  minLevel: number
  maxLevel: number
  /** Empty means every version */
  versions: readonly VersionEnum[]
}

export const DEFAULT_RANDOM_FILTERS: RandomChartFilters = {
  types: [],
  difficulties: [],
  minLevel: 12,
  maxLevel: 15,
  versions: [],
}

/** Number of filters that narrow the pool, for analytics */
export const countActiveFilters = (filters: RandomChartFilters): number =>
  (filters.types.length > 0 ? 1 : 0) +
  (filters.difficulties.length > 0 ? 1 : 0) +
  (filters.versions.length > 0 ? 1 : 0) +
  (filters.minLevel > RANDOM_LEVEL_MIN || filters.maxLevel < RANDOM_LEVEL_MAX ? 1 : 0)

export function filterRandomPool(
  sheets: readonly VersionedSheet[],
  filters: RandomChartFilters,
  region: Region,
): VersionedSheet[] {
  const types = new Set<string>(filters.types)
  const difficulties = new Set<string>(filters.difficulties)
  const versions = new Set<string>(filters.versions)
  return sheets.filter(
    (sheet) =>
      !sheet.isTypeUtage &&
      (region === '_generic' || sheet.serverIds.includes(region)) &&
      (types.size === 0 || types.has(sheet.type)) &&
      (difficulties.size === 0 || difficulties.has(sheet.difficulty)) &&
      (versions.size === 0 || versions.has(sheet.version)) &&
      sheet.internalLevelValue >= filters.minLevel &&
      // A level of 14+ is 14.6..14.9, so the upper bound covers the whole integer level
      sheet.internalLevelValue < filters.maxLevel + 1,
  )
}

export function pickRandom<T>(pool: readonly T[], random: () => number = Math.random): T | null {
  if (pool.length === 0) return null
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null
}