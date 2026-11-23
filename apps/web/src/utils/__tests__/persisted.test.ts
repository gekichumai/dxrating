import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// A refused write is module state, so each test imports a fresh copy of the module
const load = async () => {
  vi.resetModules()
  return import('../persisted')
}

const settings = z.object({ mode: z.enum(['merge', 'replace']), count: z.number() })

// On the instance: happy-dom binds storage methods to each instance, so a spy on Storage.prototype would miss them
const refuseWrites = () =>
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  })

const blockStorage = () =>
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  })

describe('persisted', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads a stored value that fits the schema and stores JSON', async () => {
    const { persisted } = await load()
    const value = persisted('settings', settings, null)

    expect(value.set({ mode: 'merge', count: 2 })).toBe(true)

    expect(window.localStorage.getItem('settings')).toBe('{"mode":"merge","count":2}')
    expect(value.get()).toEqual({ mode: 'merge', count: 2 })
  })

  it.each([
    ['an older shape', '{"mode":true}'],
    ['corrupt JSON', '{"mode":'],
  ])('reads %s as the fallback', async (_, raw) => {
    window.localStorage.setItem('settings', raw)
    const { persisted } = await load()

    expect(persisted('settings', settings, null).get()).toBeNull()
  })

  it('reads the fallback and keeps a write for the page load when the browser blocks storage', async () => {
    const { persisted } = await load()
    const value = persisted('settings', settings, null)
    blockStorage()

    expect(value.get()).toBeNull()
    expect(value.set({ mode: 'replace', count: 1 })).toBe(false)
    expect(value.get()).toEqual({ mode: 'replace', count: 1 })
  })

  it('keeps a write storage refuses over the value storage still holds, until a write succeeds', async () => {
    window.localStorage.setItem('layout', 'grid')
    const { persisted, usePersisted } = await load()
    const layout = persisted('layout', z.enum(['list', 'grid']), null, { format: 'text' })
    const { result } = renderHook(() => usePersisted(layout))
    expect(result.current[0]).toBe('grid')

    const setItem = refuseWrites()
    act(() => {
      result.current[1]('list')
    })
    expect(result.current[0]).toBe('list')
    expect(window.localStorage.getItem('layout')).toBe('grid')

    setItem.mockRestore()
    act(() => {
      result.current[1]('list')
    })
    expect(window.localStorage.getItem('layout')).toBe('list')

    // Another tab's change shows here again
    act(() => {
      window.localStorage.setItem('layout', 'grid')
      window.dispatchEvent(new StorageEvent('storage', { key: 'layout' }))
    })
    expect(result.current[0]).toBe('grid')
  })
})