import * as Sentry from '@sentry/tanstackstart-react'
import { createRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { initI18n } from './setup/init-i18n'

initI18n()

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // On the client, the router reads the nonce back from the `csp-nonce` meta tag it renders.
    ssr: { nonce: readServerCspNonce() },
  })

  if (!router.isServer) {
    Sentry.init({
      dsn: 'https://9346c04036724f129e00a750c8ab9415@o4506648698683392.ingest.us.sentry.io/4511398317064192',
      tunnel: `${import.meta.env.VITE_BACKEND_URL}/api/v1/monitoring/tunnel`,
      // The Vite plugin injects the same release used for artifact uploads.
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'development',
      enabled: import.meta.env.PROD,
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
  }

  return router
}

/** The nonce of the Content-Security-Policy of the response being rendered (start.ts), on the server only */
function readServerCspNonce(): string | undefined {
  try {
    const context = getGlobalStartContext() as { cspNonce?: unknown } | undefined
    return typeof context?.cspNonce === 'string' ? context.cspNonce : undefined
  } catch {
    // Outside a request (no start context), there is no page to render.
    return undefined
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}