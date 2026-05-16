import * as Sentry from '@sentry/tanstackstart-react'
import { createRouter } from '@tanstack/react-router'
import { BUNDLE } from './utils/bundle'
import { routeTree } from './routeTree.gen'
import { initI18n } from './setup/init-i18n'

initI18n()

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  })

  if (!router.isServer) {
    Sentry.init({
      dsn: 'https://1e929f3c3b929a213436e3c4dff57140@o4506648698683392.ingest.sentry.io/4506648709627904',
      tunnel: `${import.meta.env.VITE_BACKEND_URL}/api/v1/monitoring/tunnel`,
      release: `dxrating@${BUNDLE.version ?? 'unknown'}`,
      enabled: import.meta.env.PROD,
      integrations: [
        Sentry.tanstackRouterBrowserTracingIntegration(router, {
          shouldCreateSpanForRequest: () => true,
        }),
      ],
      tracePropagationTargets: ['localhost', /^\//, /^https?:\/\/dxrating\.net/, /^https?:\/\/miruku\.dxrating\.net/],
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

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}