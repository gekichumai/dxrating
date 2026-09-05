import { renderToString } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { createServerI18n } from '@/setup/init-i18n'
import { SUPPORTED_LOCALES } from '@/setup/locale'
import { Route } from '@/routes/rating'

describe('rating landing page SSR', () => {
  it.each(SUPPORTED_LOCALES)('serves useful %s content before the calculator loads', (locale) => {
    const i18n = createServerI18n(locale)
    const Page = Route.options.component!
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <Page />
      </I18nextProvider>,
    )
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent!
    expect(text).toContain(i18n.t('root:pages.rating.heading'))
    expect(text).toContain(i18n.t('root:pages.rating.import-description'))
    expect(text).toContain(i18n.t('root:pages.rating.calculate-description'))
    expect(text).toContain(i18n.t('root:pages.rating.share-description'))
    expect(html).toContain('id="rating-calculator"')
    expect(html).toContain('href="#rating-calculator"')
    expect(html).toContain('<output')
    expect(html).not.toContain('pages.rating.')
  })
})