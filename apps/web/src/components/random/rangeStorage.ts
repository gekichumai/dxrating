import { type LevelRange, normalizeRange, RANGE_FLOOR_EXTENDED } from './levelRange'

/** The last range used on /random, restored on the next visit (client only, after mount) */
export const RANDOM_RANGE_STORAGE_KEY = 'dxrating-random-range'

interface StoredRandomRange {
  v: 1
  range: LevelRange
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readStoredRange(storage: StorageLike | null = defaultStorage()): LevelRange | null {
  try {
    const raw = storage?.getItem(RANDOM_RANGE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredRandomRange> | null
    const range = parsed?.v === 1 ? parsed.range : undefined
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null
    return normalizeRange(range, RANGE_FLOOR_EXTENDED)
  } catch {
    return null
  }
}

export function writeStoredRange(range: LevelRange, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(RANDOM_RANGE_STORAGE_KEY, JSON.stringify({ v: 1, range } satisfies StoredRandomRange))
  } catch {
    // Private mode or a full quota: the range is simply not remembered
  }
}