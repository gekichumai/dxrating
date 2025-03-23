import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContextProvider, type AppContextStates } from '../AppContext'
import { useAppContext } from '../useAppContext'

describe('AppContext', () => {
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

  it('should initialize with default values when localStorage is empty', () => {
    mockLocalStorage.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppContextProvider,
    })

    expect(result.current.version).toBe('prism-plus')
    expect(result.current.region).toBe('jp')
  })

  it('should load values from localStorage if they exist', () => {
    const storedState: AppContextStates = {
      version: 'buddies',
      region: 'jp',
    }
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedState))

    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppContextProvider,
    })

    expect(result.current.version).toBe('buddies')
    expect(result.current.region).toBe('jp')
  })

  it('should update localStorage when values change', () => {
    mockLocalStorage.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppContextProvider,
    })

    act(() => {
      result.current.setVersionAndRegion('buddies', 'jp')
    })

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'app-context',
      JSON.stringify({
        version: 'buddies',
        region: 'jp',
      }),
    )
  })

  it('should handle malformed localStorage data', () => {
    mockLocalStorage.getItem.mockReturnValue('invalid json')

    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppContextProvider,
    })

    expect(result.current.version).toBe('prism-plus')
    expect(result.current.region).toBe('jp')
  })
})
