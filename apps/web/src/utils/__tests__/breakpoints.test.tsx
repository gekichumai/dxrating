import { act, render, screen } from '@testing-library/react'
import type { FC } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: MediaQueryListEvent) => void

// A controllable matchMedia: `matches` changes only when the test flips it, like a real min-width query
const installMatchMedia = (initial: boolean) => {
  let matches = initial
  const listeners = new Set<Listener>()
  const queries: string[] = []
  window.matchMedia = vi.fn((query: string) => {
    queries.push(query)
    return {
      get matches() {
        return matches
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList
  })
  return {
    queries,
    flip: (next: boolean) => {
      matches = next
      for (const listener of [...listeners]) listener({ matches: next } as MediaQueryListEvent)
    },
  }
}

const setInnerWidth = (value: number) =>
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value })

let renders = 0

// The module keeps one MediaQueryList for the page, so each test loads it fresh against its own matchMedia
const loadProbe = async (): Promise<FC> => {
  vi.resetModules()
  const { useIsLargeDevice } = await import('../breakpoints')
  return function Probe() {
    renders++
    return <span data-testid="probe">{useIsLargeDevice() ? 'large' : 'mobile'}</span>
  }
}

describe('useIsLargeDevice', () => {
  const originalMatchMedia = window.matchMedia
  const originalInnerWidth = window.innerWidth

  beforeEach(() => {
    renders = 0
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    setInnerWidth(originalInnerWidth)
  })

  it('follows the min-width media query, not window.innerWidth', async () => {
    const media = installMatchMedia(false)
    // On a phone, content wider than the screen makes innerWidth report more than the device width
    setInnerWidth(800)
    const Probe = await loadProbe()

    render(<Probe />)

    expect(media.queries).toEqual(['(min-width: 768px)'])
    expect(screen.getByTestId('probe').textContent).toBe('mobile')

    act(() => media.flip(true))
    expect(screen.getByTestId('probe').textContent).toBe('large')
  })

  // DXRATING-WEB-R: with react-use's createBreakpoint, every caller (one per sheet row) set state from its own resize
  // listener and after each of its commits, and a resize could hit React's nested-update limit (#185)
  it('does not re-render on resize events that do not cross the breakpoint', async () => {
    const media = installMatchMedia(true)
    const Probe = await loadProbe()
    render(
      <>
        {Array.from({ length: 200 }, (_, i) => (
          <Probe key={i} />
        ))}
      </>,
    )
    const rendersAfterMount = renders

    act(() => {
      for (let i = 0; i < 50; i++) {
        setInnerWidth(800 + (i % 2) * 400)
        window.dispatchEvent(new Event('resize'))
      }
    })

    expect(renders).toBe(rendersAfterMount)
    expect(media.queries).toHaveLength(1)
  })

  it('renders as a phone on the server, so hydration starts from the same markup', async () => {
    installMatchMedia(true)
    const Probe = await loadProbe()
    expect(renderToString(<Probe />)).toContain('mobile')
  })
})