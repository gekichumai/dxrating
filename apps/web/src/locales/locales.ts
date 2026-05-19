import i18n from 'i18next'
import en from './resources/en.json'
import ja from './resources/ja.json'
import zhHans from './resources/zh-Hans.json'
import zhHant from './resources/zh-Hant.json'

export const i18nResources = {
  en,
  ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
}

function replaceLanguageResources(
  language: keyof typeof i18nResources,
  resources?: (typeof i18nResources)[keyof typeof i18nResources],
) {
  if (!resources) return

  for (const [namespace, entries] of Object.entries(resources)) {
    i18n.addResourceBundle(language, namespace, entries, false, true)
  }
}

if (import.meta.hot) {
  import.meta.hot.accept('./resources/en.json', (mod) => {
    replaceLanguageResources('en', mod?.default)
  })
  import.meta.hot.accept('./resources/ja.json', (mod) => {
    replaceLanguageResources('ja', mod?.default)
  })
  import.meta.hot.accept('./resources/zh-Hans.json', (mod) => {
    replaceLanguageResources('zh-Hans', mod?.default)
  })
  import.meta.hot.accept('./resources/zh-Hant.json', (mod) => {
    replaceLanguageResources('zh-Hant', mod?.default)
  })
}