import { renderToString } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { createServerI18n } from '@/setup/init-i18n'
import { SearchIntroduction, featuredSearchCharts } from '../SearchIntroduction'

describe('search landing content', () => {
  it('serves ten real song destinations and localized tool links without JavaScript', () => {
    const i18n = createServerI18n('zh-Hant')
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <SearchIntroduction />
      </I18nextProvider>,
    )
    expect(featuredSearchCharts).toHaveLength(10)
    for (const chart of featuredSearchCharts) {
      expect(html).toContain(`href="${chart.path}?locale=zh-Hant"`)
    }
    expect(html).toContain('href="/rating?locale=zh-Hant"')
    expect(html).toContain('href="/charts/recent?locale=zh-Hant"')
    expect(html).toContain(i18n.t('root:pages.search.heading'))
  })
})