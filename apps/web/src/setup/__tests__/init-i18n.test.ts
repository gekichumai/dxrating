import i18n from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Module } from 'i18next'
import { i18nResources } from '@/locales/locales'
import { createServerI18n, initI18n } from '../init-i18n'
import { SUPPORTED_LOCALES } from '../locale'

function flattenResourceKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenResourceKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function collectEmptyStringKeys(value: unknown, prefix = ''): string[] {
  if (value === '') return [prefix]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectEmptyStringKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('i18n initialization', () => {
  afterEach(() => {
    delete i18n.services.languageDetector
  })

  it('registers a browser language detector even after universal initialization', () => {
    const detector = {
      type: 'languageDetector',
      init: vi.fn(),
    } satisfies Module & { init: () => void }

    initI18n()
    initI18n(detector, { caches: ['localStorage'] })

    expect(detector.init).toHaveBeenCalled()
    expect(i18n.services.languageDetector).toBe(detector)
  })

  it('resolves supported locales to their own resource bundles', () => {
    expect(createServerI18n('en').t('root:pages.search.title')).toBe('Search Charts')
    expect(createServerI18n('ja').t('root:pages.search.title')).toBe('譜面検索')
    expect(createServerI18n('zh-Hans').t('root:pages.search.title')).toBe('搜索谱面')
    expect(createServerI18n('zh-Hant').t('root:pages.search.title')).toBe('搜尋譜面')
  })

  it('keeps locale resources complete and non-empty', () => {
    const expectedKeys = flattenResourceKeys(i18nResources.en).sort()

    for (const locale of SUPPORTED_LOCALES) {
      expect(flattenResourceKeys(i18nResources[locale]).sort(), `${locale} has missing or extra translations`).toEqual(
        expectedKeys,
      )
      expect(collectEmptyStringKeys(i18nResources[locale]), `${locale} has blank translations`).toEqual([])
    }
  })

  it('uses reviewed image alt copy across locales', () => {
    expect(createServerI18n('en').t('settings:version-and-region.logo-alt', { version: 'PRiSM PLUS' })).toBe(
      'PRiSM PLUS logo',
    )
    expect(createServerI18n('en').t('sheet:version-title-alt', { version: 'PRiSM PLUS' })).toBe(
      'PRiSM PLUS version logo',
    )
    expect(createServerI18n('en').t('about:version.logo-alt', { version: 'PRiSM PLUS' })).toBe('PRiSM PLUS logo')
    expect(createServerI18n('en').t('global:dx-rank-alt', { rank: 'SSS' })).toBe('Rank SSS')
    expect(createServerI18n('zh-Hans').t('sheet:cover-art-alt', { title: 'Song Title' })).toBe('「Song Title」封面图')
    expect(createServerI18n('zh-Hans').t('sheet:version-title-alt', { version: 'PRiSM PLUS' })).toBe(
      'PRiSM PLUS 版本标志',
    )
    expect(createServerI18n('zh-Hant').t('sheet:cover-art-alt', { title: 'Song Title' })).toBe('「Song Title」封面圖')
    expect(createServerI18n('zh-Hant').t('sheet:version-title-alt', { version: 'PRiSM PLUS' })).toBe(
      'PRiSM PLUS 版本標誌',
    )
  })
})