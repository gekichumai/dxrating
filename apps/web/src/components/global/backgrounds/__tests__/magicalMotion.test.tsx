import { act, cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagicalBackground } from '../MagicalBackground'

let frames: Map<number, FrameRequestCallback>
let time: number
let nextId: number
let media: Map<string, MediaQueryList>

function step(ms = 1000 / 60) {
  time += ms
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(time)
}
function scroll(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  window.dispatchEvent(new Event('scroll'))
}
function preference(query: string, matches: boolean) {
  const target = media.get(query)!
  Object.defineProperty(target, 'matches', { configurable: true, value: matches })
  target.dispatchEvent(new Event('change'))
}
function artwork(name: string) {
  return document.querySelector<SVGSVGElement>(`.magical-background__${name} > svg`)!
}

beforeEach(() => {
  frames = new Map()
  media = new Map()
  time = 0
  nextId = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    if (!media.has(query)) {
      const target = new EventTarget() as MediaQueryList
      Object.defineProperty(target, 'matches', { configurable: true, value: false })
      media.set(query, target)
    }
    return media.get(query)!
  })
})
afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-preference-wipe')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('MAGiCAL scroll choreography', () => {
  it('keeps a complete scene in the preference wipe snapshot without replaying entrance afterward', () => {
    document.documentElement.setAttribute('data-preference-wipe', '')
    const { container, rerender } = render(<MagicalBackground />)
    document.documentElement.removeAttribute('data-preference-wipe')
    rerender(<MagicalBackground />)
    expect(container.firstElementChild?.hasAttribute('data-skip-entrance')).toBe(true)
  })

  it('has no idle loop, coalesces scroll events, and settles to the exact original composition', () => {
    render(<MagicalBackground />)
    expect(frames.size).toBe(0)
    scroll(40)
    scroll(80)
    expect(frames.size).toBe(1)
    step()
    expect(parseFloat(artwork('clock').style.getPropertyValue('rotate'))).toBeGreaterThan(0)
    expect(parseFloat(artwork('lower-clock').style.getPropertyValue('rotate'))).toBeLessThan(0)
    for (let i = 0; i < 180; i++) step()
    expect(frames.size).toBe(0)
    expect(artwork('emblems').style.getPropertyValue('translate')).toBe('')
    expect(artwork('clock').style.getPropertyValue('rotate')).toBe('')
  })

  it('bounds fast scroll impulses and reverses smoothly with scroll direction', () => {
    render(<MagicalBackground />)
    for (let i = 1; i <= 30; i++) {
      scroll(i * 500)
      step()
    }
    expect(parseFloat(artwork('clock').style.getPropertyValue('rotate'))).toBeLessThanOrEqual(0.75)
    expect(parseFloat(artwork('clock').style.getPropertyValue('rotate'))).toBeGreaterThan(0.3)
    for (const element of document.querySelectorAll<SVGSVGElement>('.magical-background__art')) {
      const translation = element.style.getPropertyValue('translate')
      if (!translation) continue
      expect(translation.split(' ').every((value) => Math.abs(parseFloat(value)) <= 8)).toBe(true)
      expect(Math.abs(parseFloat(element.style.getPropertyValue('rotate')))).toBeLessThanOrEqual(0.75)
    }
    for (let i = 29; i >= 0; i--) {
      scroll(i * 500)
      step()
    }
    expect(parseFloat(artwork('clock').style.getPropertyValue('rotate'))).toBeLessThan(-0.3)
  })

  it('disables work immediately when reduced motion is enabled and resumes only on new scrolling', () => {
    render(<MagicalBackground />)
    scroll(100)
    step()
    preference('(prefers-reduced-motion: reduce)', true)
    expect(frames.size).toBe(0)
    expect(artwork('clock').style.getPropertyValue('rotate')).toBe('')
    scroll(200)
    expect(frames.size).toBe(0)
    preference('(prefers-reduced-motion: reduce)', false)
    expect(frames.size).toBe(0)
    scroll(240)
    step()
    expect(parseFloat(artwork('clock').style.getPropertyValue('rotate'))).toBeGreaterThan(0)
  })

  it('does not update hidden mobile artwork', () => {
    render(<MagicalBackground />)
    preference('(max-width: 600px)', true)
    preference('(max-width: 1100px)', true)
    scroll(100)
    step()
    expect(artwork('character').style.getPropertyValue('translate')).toBe('')
    expect(artwork('wand').style.getPropertyValue('translate')).toBe('')
    expect(artwork('edge-right').style.getPropertyValue('translate')).toBe('')
    expect(artwork('emblems').style.getPropertyValue('translate')).not.toBe('')
  })

  it('cleans up pending frames and listeners across Strict Mode and unmount', () => {
    const { unmount } = render(
      <StrictMode>
        <MagicalBackground />
      </StrictMode>,
    )
    scroll(100)
    expect(frames.size).toBe(1)
    act(() => unmount())
    expect(frames.size).toBe(0)
    scroll(200)
    expect(frames.size).toBe(0)
  })

  it('drops momentum in background tabs without accumulating catch-up motion', () => {
    render(<MagicalBackground />)
    scroll(100)
    step()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    scroll(500)
    expect(frames.size).toBe(0)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
  })

  it('keeps movement comparable at 60 Hz and 120 Hz', () => {
    function simulate(hz: number) {
      const { unmount } = render(<MagicalBackground />)
      for (let i = 1; i <= hz; i++) {
        scroll((i * 1200) / hz)
        step(1000 / hz)
      }
      const turn = parseFloat(artwork('clock').style.getPropertyValue('rotate'))
      unmount()
      scroll(0)
      return turn
    }
    expect(Math.abs(simulate(60) - simulate(120))).toBeLessThan(0.1)
  })
})