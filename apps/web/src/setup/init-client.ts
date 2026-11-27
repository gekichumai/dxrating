import type { PostHog } from 'posthog-js'
import {
  attachAnalyticsClient,
  detectAnalyticsDeployment,
  detectAnalyticsPlatform,
  discardAnalyticsQueue,
  registerBaseAnalyticsContext,
  sanitizeAnalyticsEvent,
} from '@/lib/analytics'
import { readStoredAppContext } from '@/models/context/AppContext'

export { normalizeDetectedLanguage } from './locale'

// PostHog's chunk (~60 KB Brotli) and its init (a ~150 ms task on a phone) used to run before hydration, on every
// page. They now wait for the first idle period after it. The timeout bounds the wait: a visitor who leaves before
// PostHog loads isn't counted.
const IDLE_TIMEOUT_MS = 2000
const NO_IDLE_CALLBACK_DELAY_MS = 500

let scheduled = false

/** Loads PostHog once the page has hydrated: called from the root route's mount effect */
export function scheduleAnalytics() {
  if (scheduled) return
  scheduled = true

  const load = () => {
    import('posthog-js')
      .then(({ default: posthog }) => initPostHog(posthog))
      .catch(() => {
        // Blocked or offline: keep working without analytics
        discardAnalyticsQueue()
      })
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS })
  } else {
    setTimeout(load, NO_IDLE_CALLBACK_DELAY_MS)
  }
}

/** @internal Exported for tests */
export function initPostHog(posthog: PostHog) {
  posthog.init('phc_Hw7FM2D1vSwummp0D3O13Z6biV6udw5bKIcq4BJQxH7', {
    api_host: 'https://razu.dxrating.net',
    ui_host: 'https://app.posthog.com',
    defaults: '2026-01-30',
    capture_pageview: 'history_change',
    // Feeds web analytics session duration and bounce rate (~3% of events).
    capture_pageleave: true,
    person_profiles: 'identified_only',
    // Replay used up the free quota twice (2026-09, 2026-10) and no insight relies on it.
    disable_session_recording: true,
    // No insight uses $autocapture, heatmaps, $web_vitals or $exception; Sentry owns errors.
    // Dead clicks stay on via remote config: the Product Insights dashboard charts them.
    autocapture: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    // There are no surveys, yet remote config's `surveys: false` still makes PostHog load its 52 KB surveys script
    disable_surveys: true,
    before_send: sanitizeAnalyticsEvent,
    loaded: (instance) => {
      const platform = detectAnalyticsPlatform(window.location.href, getNativePlatform())
      const { version, region } = readStoredAppContext()
      registerBaseAnalyticsContext(instance, {
        platform,
        deployment: detectAnalyticsDeployment(window.location.href, platform),
        game_version: version,
        region,
      })

      // PostHog captures the initial `$pageview` after `loaded` (on the next tick, or once a background tab is shown).
      // The app's calls made while it loaded run right after it, in the order they had when PostHog loaded before
      // hydration: the page view first, then the page's own events, identify and super properties.
      const stop = instance.on('eventCaptured', (event: { event?: string }) => {
        if (event.event !== '$pageview') return
        stop()
        queueMicrotask(() => attachAnalyticsClient(instance))
      })
    },
  })
}

function getNativePlatform() {
  const capacitor = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return capacitor?.getPlatform?.()
}