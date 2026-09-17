import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startViewTransition, wipeOriginFromClick } from '../startViewTransition'

const originalStart = Object.getOwnPropertyDescriptor(document, 'startViewTransition')

function deferred() {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function mockTransitions() {
  const transitions: {
    update: () => void | Promise<void>
    done: ReturnType<typeof deferred>
    finished: ReturnType<typeof deferred>
    skipTransition: ReturnType<typeof vi.fn>
  }[] = []
  const start = vi.fn((update: () => void | Promise<void>) => {
    const done = deferred()
    const finished = deferred()
    const skipTransition = vi.fn()
    transitions.push({ update, done, finished, skipTransition })
    return { ready: Promise.resolve(), updateCallbackDone: done.promise, finished: finished.promise, skipTransition }
  })
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
  return { start, transitions }
}

beforeEach(() => {
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined })
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalStart) Object.defineProperty(document, 'startViewTransition', originalStart)
  else Reflect.deleteProperty(document, 'startViewTransition')
})

describe('preference wipe', () => {
  it('uses pointer coordinates and the focused control center for keyboard activation', () => {
    const button = document.createElement('button')
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 200, top: 40, width: 100, height: 40 } as DOMRect)
    expect(wipeOriginFromClick({ detail: 1, clientX: 260, clientY: 51, currentTarget: button })).toEqual({
      x: 260,
      y: 51,
    })
    expect(wipeOriginFromClick({ detail: 0, clientX: 0, clientY: 0, currentTarget: button })).toEqual({ x: 250, y: 60 })
  })

  it('flushes React updates before the browser captures the new snapshot and cleans up', async () => {
    const { transitions } = mockTransitions()
    let setValue!: (value: string) => void
    function Example() {
      const [value, set] = useState('old')
      setValue = set
      return <div>{value}</div>
    }
    render(<Example />)
    const done = startViewTransition(() => setValue('new'), { x: 0, y: 0 })
    expect(screen.getByText('old')).toBeTruthy()
    expect(document.documentElement.style.getPropertyValue('--preference-wipe-reach')).toBe(
      `${Math.hypot(window.innerWidth, window.innerHeight)}px`,
    )
    act(() => {
      transitions[0].update()
    })
    expect(screen.getByText('new')).toBeTruthy()
    transitions[0].done.resolve()
    await done
    transitions[0].finished.resolve()
    await Promise.resolve()
    expect(document.documentElement.hasAttribute('data-preference-wipe')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--preference-wipe-x')).toBe('')
  })

  it.each([false, true])('applies immediately without browser support or with reduced motion (%s)', async (reduced) => {
    const { start } = mockTransitions()
    if (reduced) vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    else Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined })
    const update = vi.fn()
    await startViewTransition(update)
    expect(update).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute('data-preference-wipe')).toBe(false)
  })

  it('drops an obsolete queued update without letting its cleanup erase the newer wipe', async () => {
    const { transitions } = mockTransitions()
    const old = vi.fn()
    const latest = vi.fn()
    void startViewTransition(old)
    void startViewTransition(latest, { x: 20, y: 30 })
    await transitions[0].update()
    transitions[0].done.resolve()
    transitions[0].finished.resolve()
    await Promise.resolve()
    expect(old).not.toHaveBeenCalled()
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce()
    expect(document.documentElement.style.getPropertyValue('--preference-wipe-x')).toBe('20px')
    await transitions[1].update()
    expect(latest).toHaveBeenCalledOnce()
    transitions[1].done.resolve()
    transitions[1].finished.resolve()
    await Promise.resolve()
  })

  it('keeps a newer instant change when an older animation callback is still queued', async () => {
    const { transitions } = mockTransitions()
    const old = vi.fn()
    const latest = vi.fn()
    void startViewTransition(old)
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    await startViewTransition(latest)
    await transitions[0].update()
    transitions[0].done.resolve()
    transitions[0].finished.resolve()
    expect(old).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
    expect(document.documentElement.hasAttribute('data-preference-wipe')).toBe(false)
  })

  it('waits for async updates and removes the wipe if an update fails', async () => {
    const { transitions } = mockTransitions()
    const update = deferred()
    const completion = startViewTransition(() => update.promise)
    const applied = transitions[0].update()
    expect(applied).toBe(update.promise)
    const error = new Error('update failed')
    const appliedAssertion = expect(applied).rejects.toThrow(error)
    const completionAssertion = expect(completion).rejects.toThrow(error)
    update.reject(error)
    transitions[0].done.reject(error)
    transitions[0].finished.reject(error)
    await Promise.all([appliedAssertion, completionAssertion])
    expect(document.documentElement.hasAttribute('data-preference-wipe')).toBe(false)
  })
})