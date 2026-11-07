import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SheetAltNames } from '../SheetAltNames'

// happy-dom has no layout: the list is 300px tall, and 112px (7rem) while its collapsed max-height applies
const CONTENT_HEIGHT = 300
const COLLAPSED_HEIGHT = 112

const activeObservers = new Set<StubResizeObserver>()

class StubResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    activeObservers.add(this)
  }
  unobserve() {}
  disconnect() {
    activeObservers.delete(this)
  }
  fire() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

const fireResizeObservers = () => act(() => [...activeObservers].forEach((observer) => observer.fire()))

describe('SheetAltNames disclosure', () => {
  const originalResizeObserver = globalThis.ResizeObserver
  const spies: { mockRestore: () => void }[] = []

  beforeAll(() => {
    globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver
    spies.push(vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => CONTENT_HEIGHT))
    spies.push(
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.className.includes('max-h-') ? COLLAPSED_HEIGHT : CONTENT_HEIGHT
      }),
    )
  })

  afterAll(() => {
    globalThis.ResizeObserver = originalResizeObserver
    for (const spy of spies) spy.mockRestore()
  })

  it('keeps the same focused button through expanding and collapsing', () => {
    const altNames = Array.from({ length: 33 }, (_, i) => `alias ${i + 1}`)
    render(<SheetAltNames altNames={altNames} />)

    const disclosure = screen.getByRole('button', { expanded: false })
    disclosure.focus()
    fireEvent.click(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')

    // Expanded, the list fits its own box; a resize then must not take the disclosure away
    fireResizeObservers()
    expect(disclosure.isConnected).toBe(true)

    fireEvent.click(disclosure)
    fireResizeObservers()
    expect(disclosure.isConnected).toBe(true)
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(disclosure)
  })
})