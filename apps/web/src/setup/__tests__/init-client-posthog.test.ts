import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: posthog }))

import { captureAnalyticsEvent, resetAnalyticsForTests } from '@/lib/analytics'
import { initPostHog, scheduleAnalytics } from '../init-client'

type Listener = (event: { event: string }) => void

/** The PostHog instance `loaded` receives, with the `eventCaptured` hook PostHog emits for every captured event */
function fakeInstance() {
  const listeners: Listener[] = []
  return {
    init: vi.fn(),
    capture: vi.fn((event: string) => {
      for (const listener of [...listeners]) listener({ event })
    }),
    get_property: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    reset: vi.fn(),
    on: vi.fn((_name: string, listener: Listener) => {
      listeners.push(listener)
      return () => listeners.splice(listeners.indexOf(listener), 1)
    }),
  }
}

function initFake() {
  const instance = fakeInstance()
  initPostHog(instance as never)
  const [, config] = instance.init.mock.calls[0]
  return { instance, config }
}

describe('PostHog client initialization', () => {
  beforeEach(() => {
    resetAnalyticsForTests()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads PostHog in an idle period after it is scheduled, not right away', async () => {
    vi.useFakeTimers()
    scheduleAnalytics()
    expect(posthog.init).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()
    await vi.waitFor(() => expect(posthog.init).toHaveBeenCalledOnce())
  })

  it('disables replay, surveys and unused capture', () => {
    const { config } = initFake()

    expect(config).toMatchObject({
      disable_session_recording: true,
      disable_surveys: true,
      autocapture: false,
      capture_heatmaps: false,
      capture_performance: false,
      capture_exceptions: false,
      capture_pageleave: true,
    })
    expect(config).not.toHaveProperty('session_recording')
    expect(config).not.toHaveProperty('capture_dead_clicks')
  })

  it('registers stored context before the first pageview, and runs earlier app calls after it', async () => {
    window.localStorage.setItem('app-context', JSON.stringify({ version: 'circle-plus', region: 'intl' }))
    captureAnalyticsEvent('song_hub_viewed', { song_id: 'song', has_records: false })
    const { instance, config } = initFake()

    // posthog-js runs `loaded` before it captures the initial pageview.
    config.loaded(instance)

    expect(instance.register).toHaveBeenCalledWith({
      platform: 'web',
      deployment: expect.any(String),
      game_version: 'circle-plus',
      region: 'intl',
    })
    expect(instance.capture).not.toHaveBeenCalled()

    instance.capture('$pageview')
    await Promise.resolve()

    expect(instance.capture.mock.calls.map(([event]) => event)).toEqual(['$pageview', 'song_hub_viewed'])
    expect(instance.register.mock.invocationCallOrder[0]).toBeLessThan(instance.capture.mock.invocationCallOrder[0])

    // Once PostHog is attached, calls go straight to it
    captureAnalyticsEvent('about_dialog_opened', {})
    expect(instance.capture).toHaveBeenLastCalledWith('about_dialog_opened', {})
  })
})