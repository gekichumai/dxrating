import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import posthog from 'posthog-js'
import { initI18n } from './init-i18n'

let initialized = false

export function normalizeDetectedLanguage(lng: string) {
  if (['en', 'ja', 'zh-Hans', 'zh-Hant'].includes(lng)) {
    return lng
  }
  if (lng === 'zh-CN' || lng === 'zh-SG') {
    return 'zh-Hans'
  }
  if (['zh-TW', 'zh-HK', 'zh-MO'].some((v) => lng.startsWith(v))) {
    return 'zh-Hant'
  }
  if (lng.startsWith('zh')) {
    return 'zh-Hans'
  }
  return 'en'
}

export function initClient() {
  if (initialized) return
  initialized = true

  const detectionOptions = {
    order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator'],
    lookupQuerystring: 'locale',
    lookupLocalStorage: 'dxrating-locale',
    lookupSessionStorage: 'dxrating-locale',
    lookupCookie: 'dxrating.locale',
    caches: ['localStorage', 'cookie'],
    convertDetectedLanguage: normalizeDetectedLanguage,
  }
  const detector = new LanguageDetector(null, detectionOptions)
  initI18n(detector, detectionOptions)
  const detected = detector.detect()
  const lng = Array.isArray(detected) ? detected[0] : detected
  if (lng && lng !== i18n.language) {
    setTimeout(() => {
      i18n.changeLanguage(lng)
    }, 0)
  }

  posthog.init('phc_Hw7FM2D1vSwummp0D3O13Z6biV6udw5bKIcq4BJQxH7', {
    api_host: 'https://razu.dxrating.net',
    ui_host: 'https://app.posthog.com',
  })
}