import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { i18nResources } from '@/locales/locales'

let initialized = false

export function initI18n() {
  if (initialized || i18n.isInitialized) return
  initialized = true

  i18n.use(initReactI18next).init({
    resources: i18nResources,
    fallbackLng: 'en',
    lng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })
}