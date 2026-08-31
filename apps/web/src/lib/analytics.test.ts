import { beforeEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({
  capture: vi.fn(),
  get_property: vi.fn(),
  identify: vi.fn(),
  register: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: posthog }))

import {
  achievementRateBand,
  captureAnalyticsEvent,
  identifyAnalyticsUser,
  resetAnalyticsUser,
  sanitizeAnalyticsEvent,
  sanitizeAnalyticsUrl,
} from './analytics'

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('captures typed events with their properties', () => {
    captureAnalyticsEvent('tab_switched', { tab: 'rating', source: 'top_navigation' })

    expect(posthog.capture).toHaveBeenCalledWith('tab_switched', {
      tab: 'rating',
      source: 'top_navigation',
    })
  })

  it('does not identify or reset an unchanged anonymous identity', () => {
    posthog.get_property.mockReturnValue(undefined)

    resetAnalyticsUser()
    expect(posthog.reset).not.toHaveBeenCalled()

    identifyAnalyticsUser('user-1')
    expect(posthog.identify).toHaveBeenCalledWith('user-1')
  })

  it('does not identify an already identified user again', () => {
    posthog.get_property.mockReturnValue('user-1')

    identifyAnalyticsUser('user-1')

    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('resets before identifying a different signed-in user', () => {
    posthog.get_property.mockReturnValue('user-1')

    identifyAnalyticsUser('user-2')

    expect(posthog.reset).toHaveBeenCalledOnce()
    expect(posthog.identify).toHaveBeenCalledWith('user-2')
  })

  it('removes query parameters and fragments from analytics URLs', () => {
    expect(sanitizeAnalyticsUrl('https://dxrating.net/search?q=private#result')).toBe('https://dxrating.net/search')
    expect(sanitizeAnalyticsUrl('/search?q=private#result')).toBe('/search')
  })

  it('sanitizes URL properties without dropping required event properties', () => {
    const event = sanitizeAnalyticsEvent({
      uuid: 'event-1',
      event: '$pageview',
      properties: {
        token: 'project-token',
        $current_url: 'https://dxrating.net/search?q=private',
        $referrer: 'https://example.com/source?campaign=private',
      },
    })

    expect(event?.properties).toMatchObject({
      token: 'project-token',
      $current_url: 'https://dxrating.net/search',
      $referrer: 'https://example.com/source',
    })
  })

  it('buckets achievement rates without exposing exact scores', () => {
    expect(achievementRateBand(100.6)).toBe('100.5-101')
    expect(achievementRateBand(99.75)).toBe('99-99.9999')
    expect(achievementRateBand(79.9)).toBe('below-80')
  })
})