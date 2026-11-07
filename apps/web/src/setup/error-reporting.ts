import * as Sentry from '@sentry/tanstackstart-react'
import type { AnyRouter } from '@tanstack/react-router'
import { sentryScrubOptions } from '@/lib/sentryScrub'
import type { TelemetrySdk } from '@/lib/telemetry'

/**
 * Starts the browser SDK. Loaded with import() after hydration (see error-reporting-loader.ts), so nothing the first
 * render needs depends on this module or on the SDK's chunk.
 */
export function initErrorReporting(router: AnyRouter): TelemetrySdk {
  Sentry.init({
    dsn: 'https://9346c04036724f129e00a750c8ab9415@o4506648698683392.ingest.us.sentry.io/4511398317064192',
    tunnel: `${import.meta.env.VITE_BACKEND_URL}/api/v1/monitoring/tunnel`,
    // The same release the Vite plugin uses for artifact uploads (see vite.config.ts)
    release: import.meta.env.VITE_SENTRY_RELEASE,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'development',
    integrations: [
      Sentry.tanstackRouterBrowserTracingIntegration(router, {
        shouldCreateSpanForRequest: () => true,
      }),
    ],
    // Not the song catalog: trace headers would make its revalidation fail the API's CORS preflight
    tracePropagationTargets: [
      'localhost',
      /^\//,
      /^https?:\/\/dxrating\.net/,
      /^https?:\/\/miruku\.dxrating\.net\/(?!api\/v1\/dxdata)/,
    ],
    tracesSampleRate: 0.2,
    // OAuth callbacks carry one-time code and state in the query
    ...sentryScrubOptions,
    // Sends what the app logs with Sentry.logger (saved-data migrations, catalog API fallbacks); nothing else
    enableLogs: true,
    ignoreErrors: [
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      'http://tt.epicplay.com',
      "Can't find variable: ZiteReader",
      'jigsaw is not defined',
      'ComboSearch is not defined',
      'http://loading.retry.widdit.com/',
      'atomicFindClose',
      'fb_xd_fragment',
      'bmi_SafeAddOnload',
      'EBCallBackMessageReceived',
      'conduitPage',
      '_avast_submit',
      'vivoNewsDetailPage',
      'removeAD',
      'ucbrowser',
      '__gCrWeb',
    ],
    denyUrls: [
      /pagead\/js/i,
      /graph\.facebook\.com/i,
      /connect\.facebook\.net\/en_US\/all\.js/i,
      /eatdifferent\.com\.woopra-ns\.com/i,
      /static\.woopra\.com\/js\/woopra\.js/i,
      /extensions\//i,
      /^chrome:\/\//i,
      /127\.0\.0\.1:4001\/isrunning/i,
      /webappstoolbarba\.texthelp\.com\//i,
      /metrics\.itunes\.apple\.com\.edgesuite\.net\//i,
    ],
  })
  // Only what the app calls: returning the whole namespace would keep the entire SDK in the bundle
  return { metrics: Sentry.metrics, logger: Sentry.logger, captureException: Sentry.captureException }
}