import posthog from 'posthog-js'
import {
  detectAnalyticsDeployment,
  detectAnalyticsPlatform,
  registerBaseAnalyticsContext,
  sanitizeAnalyticsEvent,
} from '@/lib/analytics'
import { readStoredAppContext } from '@/models/context/AppContext'

export { normalizeDetectedLanguage } from './locale'

let initialized = false

export function initClient() {
  if (initialized) return
  initialized = true

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
    before_send: sanitizeAnalyticsEvent,
    loaded: () => {
      const platform = detectAnalyticsPlatform(window.location.href, getNativePlatform())
      const { version, region } = readStoredAppContext()
      registerBaseAnalyticsContext({
        platform,
        deployment: detectAnalyticsDeployment(window.location.href, platform),
        game_version: version,
        region,
      })
    },
  })
}

function getNativePlatform() {
  const capacitor = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return capacitor?.getPlatform?.()
}