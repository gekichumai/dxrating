import { describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: posthog }))

import { initClient } from '../init-client'

describe('PostHog client initialization', () => {
  it('disables replay and unused capture, and registers stored context before the first pageview', () => {
    window.localStorage.setItem('app-context', JSON.stringify({ version: 'circle-plus', region: 'intl' }))
    initClient()

    expect(posthog.init).toHaveBeenCalledOnce()
    const [, config] = posthog.init.mock.calls[0]
    expect(config).toMatchObject({
      disable_session_recording: true,
      autocapture: false,
      capture_heatmaps: false,
      capture_performance: false,
      capture_exceptions: false,
      capture_pageleave: true,
    })
    expect(config).not.toHaveProperty('session_recording')
    expect(config).not.toHaveProperty('capture_dead_clicks')

    // posthog-js runs `loaded` before it captures the initial pageview.
    config.loaded(posthog)

    expect(posthog.register).toHaveBeenCalledWith({
      platform: 'web',
      deployment: expect.any(String),
      game_version: 'circle-plus',
      region: 'intl',
    })
  })
})