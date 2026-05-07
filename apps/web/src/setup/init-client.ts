import * as Sentry from '@sentry/react'
import { browserTracingIntegration } from '@sentry/react'
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import posthog from 'posthog-js'
import { BUNDLE } from '@/utils/bundle'
import { initI18n } from './init-i18n'

let initialized = false

export function initClient() {
  if (initialized) return
  initialized = true

  initI18n()

  const detector = new LanguageDetector(null, {
    order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator'],
    lookupQuerystring: 'locale',
    lookupLocalStorage: 'dxrating-locale',
    lookupSessionStorage: 'dxrating-locale',
    lookupCookie: 'dxrating.locale',
    caches: ['localStorage', 'cookie'],
    convertDetectedLanguage(lng) {
      if (['en', 'ja', 'zh-Hans', 'zh-Hant'].includes(lng)) {
        return lng
      }
      if (lng === 'zh-CN') {
        return 'zh-Hans'
      }
      if (['zh-TW', 'zh-HK', 'zh-MO', 'zh-SG'].some((v) => lng.startsWith(v))) {
        return 'zh-Hant'
      }
      if (lng.startsWith('zh')) {
        return 'zh-Hans'
      }
      return 'en'
    },
  })
  const detected = detector.detect()
  const lng = Array.isArray(detected) ? detected[0] : detected
  if (lng && lng !== i18n.language) {
    i18n.changeLanguage(lng)
  }

  posthog.init('phc_Hw7FM2D1vSwummp0D3O13Z6biV6udw5bKIcq4BJQxH7', {
    api_host: 'https://razu.dxrating.net',
    ui_host: 'https://app.posthog.com',
  })

  Sentry.init({
    dsn: 'https://1e929f3c3b929a213436e3c4dff57140@o4506648698683392.ingest.sentry.io/4506648709627904',
    tunnel: `${import.meta.env.VITE_BACKEND_URL}/api/v1/monitoring/tunnel`,
    release: `dxrating@${BUNDLE.version ?? 'unknown'}`,
    enabled: import.meta.env.PROD,
    integrations: [
      browserTracingIntegration({
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