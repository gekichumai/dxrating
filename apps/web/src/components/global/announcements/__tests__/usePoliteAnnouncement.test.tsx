import type { PublicAnnouncement } from '@gekichumai/api-contract'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePoliteAnnouncement } from '../AnnouncementBanner'

const announcement = (overrides: Partial<PublicAnnouncement> = {}): PublicAnnouncement => ({
  id: 1,
  revision: 1,
  severity: 'warning',
  title: { en: 'Maintenance' },
  body: { en: 'Imports pause for an hour.' },
  link: null,
  startsAt: '2026-11-08T00:00:00Z',
  endsAt: null,
  platforms: [],
  regions: [],
  minAppVersion: null,
  maxAppVersion: null,
  dismissible: true,
  ...overrides,
})

const render = (initial: PublicAnnouncement[]) =>
  renderHook(({ visible }) => usePoliteAnnouncement(visible, 'en', {}), { initialProps: { visible: initial } })

describe('usePoliteAnnouncement', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('re-announces a revision that changes only the body', () => {
    const { result, rerender } = render([announcement()])
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('Warning: Maintenance. Imports pause for an hour.')

    rerender({ visible: [announcement({ revision: 2, body: { en: 'Imports pause for four hours.' } })] })
    // The region is emptied first, so even identical text would count as a change
    expect(result.current).toBe('')
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('Warning: Maintenance. Imports pause for four hours.')
  })

  it('queues notices that arrive within the delay instead of dropping the first', () => {
    const first = announcement({ id: 1, title: { en: 'Maintenance' } })
    const second = announcement({
      id: 2,
      severity: 'info',
      title: { en: 'New songs' },
      body: { en: 'Ten songs added.' },
    })
    const { result, rerender } = render([first])
    act(() => vi.advanceTimersByTime(50))
    rerender({ visible: [first, second] })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('Warning: Maintenance. Imports pause for an hour. Notice: New songs. Ten songs added.')
  })

  it('announces a notice once, and leaves critical ones to their alert', () => {
    const { result, rerender } = render([announcement({ severity: 'critical' })])
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('')

    rerender({ visible: [announcement({ id: 3 })] })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('Warning: Maintenance. Imports pause for an hour.')
    rerender({ visible: [announcement({ id: 3 })] })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('Warning: Maintenance. Imports pause for an hour.')
  })
})