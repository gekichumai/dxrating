import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG_UNVERIFIED_HINT_SHOWN_KEY, CatalogUnverifiedHint } from '../CatalogUnverifiedHint'

const toastMock = vi.hoisted(() => vi.fn())
vi.mock('react-hot-toast', () => ({ default: toastMock }))

const catalog = vi.hoisted(() => ({ unverified: false, listeners: new Set<() => void>() }))
vi.mock('@/catalog/clientCatalog', () => ({
  isLoadedCatalogUnverified: () => catalog.unverified,
  subscribeToCatalog: (listener: () => void) => {
    catalog.listeners.add(listener)
    return () => catalog.listeners.delete(listener)
  },
}))

const setUnverified = (value: boolean) =>
  act(() => {
    catalog.unverified = value
    for (const listener of catalog.listeners) listener()
  })

describe('CatalogUnverifiedHint', () => {
  beforeEach(() => {
    sessionStorage.clear()
    toastMock.mockReset()
    catalog.unverified = false
  })
  afterEach(cleanup)

  it('stays quiet while the API vouches for the catalog', () => {
    render(<CatalogUnverifiedHint />)
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('shows one toast when the catalog falls back, and only once per tab', () => {
    render(<CatalogUnverifiedHint />)
    setUnverified(true)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock.mock.calls[0]![1]).toMatchObject({ id: 'catalog-unverified', duration: 8000 })
    expect(sessionStorage.getItem(CATALOG_UNVERIFIED_HINT_SHOWN_KEY)).toBe('1')

    setUnverified(false)
    setUnverified(true)
    cleanup()
    render(<CatalogUnverifiedHint />)
    expect(toastMock).toHaveBeenCalledTimes(1)
  })
})