import { describe, expect, it } from 'vitest'
import { RANDOM_RANGE_STORAGE_KEY, readStoredRange, writeStoredRange } from './rangeStorage'

const memoryStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  }
}

describe('random range persistence', () => {
  it('round-trips the last range', () => {
    const storage = memoryStorage()
    expect(readStoredRange(storage)).toBeNull()
    writeStoredRange({ min: 137, max: 142 }, storage)
    expect(readStoredRange(storage)).toEqual({ min: 137, max: 142 })
  })

  it('ignores corrupt, foreign and out-of-scale values', () => {
    const storage = memoryStorage()
    storage.map.set(RANDOM_RANGE_STORAGE_KEY, '{not json')
    expect(readStoredRange(storage)).toBeNull()
    storage.map.set(RANDOM_RANGE_STORAGE_KEY, JSON.stringify({ v: 2, range: { min: 130, max: 140 } }))
    expect(readStoredRange(storage)).toBeNull()
    storage.map.set(RANDOM_RANGE_STORAGE_KEY, JSON.stringify({ v: 1, range: { min: 'a', max: 140 } }))
    expect(readStoredRange(storage)).toBeNull()
    storage.map.set(RANDOM_RANGE_STORAGE_KEY, JSON.stringify({ v: 1, range: { min: 0, max: 999 } }))
    expect(readStoredRange(storage)).toEqual({ min: 10, max: 150 })
  })

  it('survives a storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(readStoredRange(throwing)).toBeNull()
    expect(() => writeStoredRange({ min: 130, max: 140 }, throwing)).not.toThrow()
  })
})