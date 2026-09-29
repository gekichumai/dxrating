import i18n, { createInstance } from 'i18next'
import type { InitOptions, Module, Services } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { i18nResources } from '@/locales/locales'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './locale'

let initialized = false

type RuntimeLanguageDetector = Module & {
  init?: (services: Services, detectorOptions?: object, i18nextOptions?: InitOptions) => void
}

function registerLanguageDetectorAfterInit(languageDetector: Module, detectionOptions?: object) {
  if (i18n.services.languageDetector !== undefined && i18n.services.languageDetector !== null) return

  const detector = languageDetector as RuntimeLanguageDetector
  i18n.use(languageDetector)
  detector.init?.(i18n.services, detectionOptions, i18n.options)
  i18n.services.languageDetector = detector
}

export function initI18n(languageDetector?: Module, detectionOptions?: object) {
  if (initialized || i18n.isInitialized) {
    if (languageDetector !== null && languageDetector !== undefined) {
      registerLanguageDetectorAfterInit(languageDetector, detectionOptions)
    }
    return
  }
  initialized = true

  if (languageDetector !== null && languageDetector !== undefined) {
    i18n.use(languageDetector)
  }

  void i18n.use(initReactI18next).init({
    ...getI18nInitOptions(DEFAULT_LOCALE),
    detection: detectionOptions,
  })
}

export function getI18nInitOptions(lng: SupportedLocale): InitOptions {
  return {
    resources: i18nResources,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    lng,
    keySeparator: false,
    interpolation: {
      escapeValue: false,
    },
  }
}

export function createServerI18n(locale: SupportedLocale) {
  const instance = createInstance()
  void instance.use(initReactI18next).init({
    ...getI18nInitOptions(locale),
    initImmediate: false,
  })

  return instance
}