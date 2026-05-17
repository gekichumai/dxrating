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
      dsn: 'https://9346c04036724f129e00a750c8ab9415@o4506648698683392.ingest.us.sentry.io/4511398317064192',
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