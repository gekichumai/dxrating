import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The unsaved choice is module state, so each test imports a fresh copy of the module
const loadHook = async () => {
  vi.resetModules()
  return (await import('../sheetListLayout')).useSheetListLayout
}

// On the instance: happy-dom binds storage methods to each instance, so a spy on Storage.prototype would miss them
const refuseWrites = () =>
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  })

describe('useSheetListLayout', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('remembers a choice in storage', async () => {
    const useSheetListLayout = await loadHook()
    const { result } = renderHook(() => useSheetListLayout())

    act(() => result.current[1]('grid'))

    expect(result.current[0]).toBe('grid')
    expect(window.localStorage.getItem('sheet-list-layout')).toBe('grid')
  })

  it('keeps a new choice for the page load when storage refuses it, over the choice storage still holds', async () => {
    window.localStorage.setItem('sheet-list-layout', 'grid')
    const useSheetListLayout = await loadHook()
    const { result } = renderHook(() => useSheetListLayout())
    expect(result.current[0]).toBe('grid')

    refuseWrites()
    act(() => result.current[1]('list'))

    expect(result.current[0]).toBe('list')
    expect(window.localStorage.getItem('sheet-list-layout')).toBe('grid')
  })

  it('goes back to storage once a save succeeds again', async () => {
    const useSheetListLayout = await loadHook()
    const { result } = renderHook(() => useSheetListLayout())

    const setItem = refuseWrites()
    act(() => result.current[1]('grid'))
    expect(result.current[0]).toBe('grid')

    setItem.mockRestore()
    act(() => result.current[1]('list'))
    expect(window.localStorage.getItem('sheet-list-layout')).toBe('list')

    // Another tab's choice now shows here
    act(() => {
      window.localStorage.setItem('sheet-list-layout', 'grid')
      window.dispatchEvent(new StorageEvent('storage', { key: 'sheet-list-layout' }))
    })
    expect(result.current[0]).toBe('grid')
  })
})