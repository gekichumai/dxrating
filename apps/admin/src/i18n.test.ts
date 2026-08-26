import { ADMIN_CHART_REPORT_CATEGORY_KEYS, ADMIN_CHART_REPORT_FIELD_KEYS } from '@gekichumai/admin-contract'
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

  it('labels every canonical chart-report field and category without exposing raw keys as the primary copy', () => {
    for (const field of ADMIN_CHART_REPORT_FIELD_KEYS) {
      const key = `chartReports.fields.${field}` as keyof typeof englishCatalog
      expect(englishCatalog[key], `missing label for ${field}`).toBeTruthy()
      expect(englishCatalog[key]).not.toBe(field)
    }
    for (const category of ADMIN_CHART_REPORT_CATEGORY_KEYS) {
      const key = `chartReports.categories.${category}` as keyof typeof englishCatalog
      expect(englishCatalog[key], `missing label for ${category}`).toBeTruthy()
      expect(englishCatalog[key]).not.toBe(category)
    }
  })
})