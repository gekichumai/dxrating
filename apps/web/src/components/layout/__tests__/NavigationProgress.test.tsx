import { act, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NAVIGATION_FEEDBACK_DELAY_MS, NavigationProgress } from '../NavigationProgress'
import { beginAppBusy } from '../appBusy'

let pending = false

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (state: { status: string }) => boolean }) =>
    select({ status: pending ? 'pending' : 'idle' }),
}))

const phase = (container: HTMLElement) => container.querySelector('.navigation-progress')?.getAttribute('data-phase')

describe('NavigationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pending = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('server-renders hidden, so the first client render matches', () => {
    expect(renderToString(<NavigationProgress />)).toBe(
      '<div aria-hidden="true" class="navigation-progress" data-phase="idle"><div class="navigation-progress__bar"></div></div>',
    )
  })

  it('shows only once a navigation has been pending for the delay, then fills and hides', () => {
    const { container, rerender } = render(<NavigationProgress />)

    pending = true
    rerender(<NavigationProgress />)
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS - 1)
    })
    expect(phase(container)).toBe('idle')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(phase(container)).toBe('loading')

    pending = false
    rerender(<NavigationProgress />)
    expect(phase(container)).toBe('done')
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(phase(container)).toBe('idle')
  })

  it('never shows for a navigation faster than the delay', () => {
    const { container, rerender } = render(<NavigationProgress />)

    pending = true
    rerender(<NavigationProgress />)
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS - 50)
    })
    pending = false
    rerender(<NavigationProgress />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(phase(container)).toBe('idle')
  })

  it('also runs while other work the visitor waits on is busy (a version switch)', () => {
    const { container } = render(<NavigationProgress />)

    let end!: () => void
    act(() => {
      end = beginAppBusy()
    })
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS)
    })
    expect(phase(container)).toBe('loading')

    act(() => {
      end()
    })
    expect(phase(container)).toBe('done')
  })
})