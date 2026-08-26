import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  if (typeof document === 'undefined') return
  cleanup()
  document.querySelectorAll('[data-mantine-shared-portal-node]').forEach((node) => node.remove())
})

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  class ResizeObserverStub implements ResizeObserver {
    disconnect = vi.fn()
    observe = vi.fn()
    unobserve = vi.fn()
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('scrollTo', vi.fn())
  Element.prototype.scrollIntoView = vi.fn()
}