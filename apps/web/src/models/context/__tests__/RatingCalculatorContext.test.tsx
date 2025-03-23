import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorContextProvider, useRatingCalculatorContext } from '../RatingCalculatorContext'

describe('RatingCalculatorContext', () => {
  const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    })
  })

  const mockEntry: PlayEntry = {
    sheetId: 'test-sheet-1',
    achievementRate: 98.5,
    providerConfig: {
      divingFish: {
        ratingEligibility: 'b15',
      },
    },
  }

  it('should initialize with empty entries when localStorage is empty', () => {
    mockLocalStorage.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useRatingCalculatorContext(), {
      wrapper: RatingCalculatorContextProvider,
    })

    expect(result.current.entries).toEqual([])
  })

  it('should load entries from localStorage if they exist', () => {
    const storedEntries = [mockEntry]
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedEntries))

    const { result } = renderHook(() => useRatingCalculatorContext(), {
      wrapper: RatingCalculatorContextProvider,
    })

    expect(result.current.entries).toEqual(storedEntries)
  })

  it('should update localStorage when entries are modified', () => {
    mockLocalStorage.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useRatingCalculatorContext(), {
      wrapper: RatingCalculatorContextProvider,
    })

    act(() => {
      result.current.modifyEntries.push(mockEntry)
    })

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('rating-calculator-entries', JSON.stringify([mockEntry]))
  })

  it('should handle malformed localStorage data', () => {
    mockLocalStorage.getItem.mockReturnValue('invalid json')

    const { result } = renderHook(() => useRatingCalculatorContext(), {
      wrapper: RatingCalculatorContextProvider,
    })

    expect(result.current.entries).toEqual([])
  })

  it('should persist multiple entries in localStorage', () => {
    mockLocalStorage.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useRatingCalculatorContext(), {
      wrapper: RatingCalculatorContextProvider,
    })

    const secondEntry: PlayEntry = {
      ...mockEntry,
      sheetId: 'test-sheet-2',
      achievementRate: 97.0,
    }

    act(() => {
      result.current.modifyEntries.push(mockEntry)
      result.current.modifyEntries.push(secondEntry)
    })

    expect(mockLocalStorage.setItem).toHaveBeenLastCalledWith(
      'rating-calculator-entries',
      JSON.stringify([mockEntry, secondEntry]),
    )
  })
})
