import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScrollPositions, holdScrollPosition } from '../ScrollRestorationKeeper'

const entry = (key: string, hash = '') => ({ hash, state: { __TSR_key: key } })

describe('createScrollPositions', () => {
  it('returns the position an entry was left at when it is revisited', () => {
    const positions = createScrollPositions()
    positions.leave(entry('home'), 6000)
    expect(positions.revisit(entry('home'))).toBe(6000)
  })

  it('has nothing for a new entry, so a pushed page starts at the top', () => {
    const positions = createScrollPositions()
    positions.leave(entry('home'), 6000)
    expect(positions.revisit(entry('new-home'))).toBeUndefined()
  })

  it('leaves the top and hash targets to the router', () => {
    const positions = createScrollPositions()
    positions.leave(entry('top'), 0)
    positions.leave(entry('anchor'), 900)
    expect(positions.revisit(entry('top'))).toBeUndefined()
    expect(positions.revisit(entry('anchor', 'section'))).toBeUndefined()
  })
})
describe('holdScrollPosition', () => {
  let scrollY = 0
  let maxScroll = 500
  const scrollTo = vi.fn(({ top }: { top: number }) => {
    scrollY = Math.min(top, maxScroll)
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] })
    scrollY = 0
    maxScroll = 500
    scrollTo.mockClear()
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo as unknown as typeof window.scrollTo)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reaches the saved position once the page has grown enough, then lets go', () => {
    const end = holdScrollPosition(6000)
    expect(scrollY).toBe(500) // clamped: the list has not rendered yet

    maxScroll = 20000 // the list renders; nothing about the body's box changes
    vi.advanceTimersByTime(32)
    expect(scrollY).toBe(6000)
    expect(document.documentElement.style.overflowAnchor).toBe('none')

    vi.advanceTimersByTime(2500)
    scrollY = 6400 // the visitor scrolls on
    const calls = scrollTo.mock.calls.length
    vi.advanceTimersByTime(100)
    expect(scrollTo.mock.calls.length).toBe(calls)
    expect(document.documentElement.style.overflowAnchor).toBe('')
    end()
  })

  it('stops at the first input from the visitor', () => {
    holdScrollPosition(6000)
    window.dispatchEvent(new Event('wheel'))
    const calls = scrollTo.mock.calls.length
    maxScroll = 20000
    vi.advanceTimersByTime(100)
    expect(scrollTo.mock.calls.length).toBe(calls)
  })
})