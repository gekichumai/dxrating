import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import posthog from 'posthog-js'
import { initI18n } from './init-i18n'
import { getClientLanguageDetectionOptions, resolveSupportedLocale } from './locale'

export { normalizeDetectedLanguage } from './locale'

let initialized = false

export function initClient() {
  if (initialized) return
  initialized = true

  const detectionOptions = getClientLanguageDetectionOptions()
  const detector = new LanguageDetector(null, detectionOptions)
  initI18n(detector, detectionOptions)
  const lng = resolveSupportedLocale(detector.detect())
  if (lng && lng !== i18n.language) {
    void i18n.changeLanguage(lng)
  }

  posthog.init('phc_Hw7FM2D1vSwummp0D3O13Z6biV6udw5bKIcq4BJQxH7', {
    api_host: 'https://razu.dxrating.net',
    ui_host: 'https://app.posthog.com',
  })
}