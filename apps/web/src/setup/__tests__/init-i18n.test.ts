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
    expect(createServerI18n('en').t('root:pages.search.title')).toBe('Search charts')
    expect(createServerI18n('ja').t('root:pages.search.title')).toBe('譜面検索')
    expect(createServerI18n('ko').t('root:pages.search.title')).toBe('채보 검색')
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

  it('uses reviewed Korean copy for creating and binding a SEGA ID', () => {
    const korean = createServerI18n('ko')

    expect(korean.t('rating-calculator:io.import.net-records.dialog.help.register.title')).toBe('SEGA ID가 아직 없어요')
    expect(korean.t('rating-calculator:io.import.net-records.dialog.help.register.step2')).toBe(
      '해당 SEGA ID로 maimai NET에 로그인한 뒤, 플레이에 사용하는 Aime 카드를 등록하세요.',
    )
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

  it('keeps namespace entries flat because keySeparator is disabled', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [namespace, entries] of Object.entries(i18nResources[locale])) {
        const nested = Object.entries(entries as Record<string, unknown>)
          .filter(([, value]) => value !== null && typeof value === 'object')
          .map(([key]) => key)
        expect(nested, `${locale}/${namespace} has nested keys`).toEqual([])
      }
    }
  })

  it('resolves random and recommend page strings in every locale', () => {
    const keys = [
      'random:title',
      'random:filters.type',
      'random:filters.difficulty',
      'random:filters.level',
      'random:filters.version',
      'random:filters.all-versions',
      'recommend:title',
      'recommend:stats.total',
      'recommend:stats.b15-floor',
      'recommend:stats.b35-floor',
    ]

    for (const locale of SUPPORTED_LOCALES) {
      const i18nInstance = createServerI18n(locale)
      for (const key of keys) {
        const value = i18nInstance.t(key)
        expect(value, `${locale} ${key}`).not.toBe(key)
        expect(value, `${locale} ${key}`).not.toBe(key.split(':')[1])
        expect(value, `${locale} ${key}`).toBeTruthy()
      }
    }
  })
})
