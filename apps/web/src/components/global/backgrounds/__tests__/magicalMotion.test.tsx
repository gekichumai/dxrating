import { act, cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagicalBackground } from '../MagicalBackground'

let frames: Map<number, FrameRequestCallback>
let time = 0
let media: Map<string, MediaQueryList>
function step() {
  time += 1000 / 60
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(time))
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
beforeEach(() => {
  frames = new Map()
  media = new Map()
  time = 0
  let nextId = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextId, callback)
    return nextId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
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
})

describe('MAGiCAL hydration entrance', () => {
  it('starts entrance motion on hydration without replacing server artwork', async () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<MagicalBackground />)
    document.body.append(container)
    const scene = container.firstElementChild!
    expect(scene.hasAttribute('data-ready')).toBe(false)
    expect(scene.querySelector('.magical-background__paper')).not.toBeNull()
    const onRecoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, <MagicalBackground />, { onRecoverableError })
    })
    expect(container.firstElementChild).toBe(scene)
    expect(scene.hasAttribute('data-ready')).toBe(true)
    expect(onRecoverableError).not.toHaveBeenCalled()
    act(() => root!.unmount())
    expect(scene.hasAttribute('data-ready')).toBe(false)
    container.remove()
  })

  it('shows a complete destination scene for preference wipes and does not replay on rerender', () => {
    document.documentElement.setAttribute('data-preference-wipe', '')
    const { container, rerender } = render(<MagicalBackground />)
    document.documentElement.removeAttribute('data-preference-wipe')
    rerender(<MagicalBackground />)
    expect(container.firstElementChild?.hasAttribute('data-ready')).toBe(true)
    expect(container.firstElementChild?.hasAttribute('data-skip-entrance')).toBe(true)
  })

  it('runs no idle JavaScript loop and cleans up pending scroll frames in Strict Mode', () => {
    const { container, unmount } = render(
      <StrictMode>
        <MagicalBackground />
      </StrictMode>,
    )
    const scene = container.firstElementChild!
    expect(frames.size).toBe(0)
    scroll(100)
    expect(frames.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
    expect(scene.hasAttribute('data-ready')).toBe(false)
    scroll(200)
    expect(frames.size).toBe(0)
  })

  it('caps scroll displacement and settles back without changing artwork transforms', () => {
    const { container } = render(<MagicalBackground />)
    const layer = container.querySelector<HTMLElement>('[data-drift="palace"]')!
    for (let i = 1; i <= 60; i++) {
      scroll(i * 100)
      step()
    }
    const force = Number(layer.style.getPropertyValue('translate').match(/\* (-?[\d.]+)/)?.[1])
    expect(force).toBeGreaterThanOrEqual(-0.6)
    expect(force).toBeLessThan(-0.59)
    expect(layer.querySelector('svg')?.style.getPropertyValue('transform')).toBe('')
    for (let i = 0; i < 180; i++) step()
    expect(frames.size).toBe(0)
    expect(layer.style.getPropertyValue('translate')).toBe('')
  })

  it('disables scroll work for reduced motion, hidden tabs, and preference wipes', () => {
    const { container } = render(<MagicalBackground />)
    scroll(100)
    step()
    preference('(prefers-reduced-motion: reduce)', true)
    expect(frames.size).toBe(0)
    scroll(200)
    expect(frames.size).toBe(0)
    preference('(prefers-reduced-motion: reduce)', false)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(container.firstElementChild?.hasAttribute('data-motion-paused')).toBe(true)
    scroll(300)
    expect(frames.size).toBe(0)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(container.firstElementChild?.hasAttribute('data-motion-paused')).toBe(false)
    document.documentElement.setAttribute('data-preference-wipe', '')
    scroll(400)
    expect(frames.size).toBe(0)
  })

  it('does not update invisible phone decorations', () => {
    const { container } = render(<MagicalBackground />)
    preference('(max-width: 600px)', true)
    preference('(max-width: 1100px)', true)
    scroll(100)
    step()
    for (const name of ['character', 'edge-right', 'wand']) {
      expect(container.querySelector<HTMLElement>(`[data-drift="${name}"]`)?.style.getPropertyValue('translate')).toBe(
        '',
      )
    }
    expect(container.querySelector<HTMLElement>('[data-drift="palace"]')?.style.getPropertyValue('translate')).not.toBe(
      '',
    )
  })
})