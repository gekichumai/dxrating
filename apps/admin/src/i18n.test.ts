import { describe, expect, it } from 'vitest'
import { englishCatalog, translate } from './i18n'
import { ADMIN_DESTINATIONS } from './navigation'

describe('administrator translation catalog', () => {
  it('covers every destination label, title, and description', () => {
    for (const destination of ADMIN_DESTINATIONS) {
      expect(englishCatalog[destination.labelKey]).toBeTruthy()
      expect(englishCatalog[destination.titleKey]).toBeTruthy()
      expect(englishCatalog[destination.descriptionKey]).toBeTruthy()
    }
  })

  it('interpolates visible environment labels through the adapter', () => {
    expect(translate('environment.badge', { environment: 'preview' })).toBe('preview environment')
  })
})