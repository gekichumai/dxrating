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

if (import.meta.hot) {
  import.meta.hot.accept('./resources/en.json', (mod) => {
    i18n.addResourceBundle('en', 'translation', mod?.default, true, true)
  })
  import.meta.hot.accept('./resources/ja.json', (mod) => {
    i18n.addResourceBundle('ja', 'translation', mod?.default, true, true)
  })
  import.meta.hot.accept('./resources/zh-Hans.json', (mod) => {
    i18n.addResourceBundle('zh-Hans', 'translation', mod?.default, true, true)
  })
  import.meta.hot.accept('./resources/zh-Hant.json', (mod) => {
    i18n.addResourceBundle('zh-Hant', 'translation', mod?.default, true, true)
  })
}