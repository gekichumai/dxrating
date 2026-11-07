import { describe, expect, it } from 'vitest'
import { BASE_LOCALE, isSupportedLocale, localeChain, resolveLocalized, SUPPORTED_LOCALES } from '../locales'

describe('locales', () => {
  it('lists the base locale first and every tag once', () => {
    expect(SUPPORTED_LOCALES[0]).toBe(BASE_LOCALE)
    expect(new Set(SUPPORTED_LOCALES).size).toBe(SUPPORTED_LOCALES.length)
  })

  it('accepts only listed tags', () => {
    expect(isSupportedLocale('zh-Hant')).toBe(true)
    expect(isSupportedLocale('zh-TW')).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
  })

  it.each([
    ['zh-Hant', ['zh-Hant', 'zh-Hans', 'en']],
    ['zh-Hans', ['zh-Hans', 'zh-Hant', 'en']],
    ['ja', ['ja', 'en']],
    ['en', ['en']],
    // a language added later without a fallback entry goes straight to English
    ['ms', ['ms', 'en']],
  ])('chains %s as %j', (locale, chain) => {
    expect(localeChain(locale)).toEqual(chain)
  })

  it('takes a served fallback table', () => {
    expect(localeChain('ms', { ms: ['id'] })).toEqual(['ms', 'id', 'en'])
  })

  it('resolves the viewer’s text, a fallback, or English, skipping blanks', () => {
    const text = { en: 'Maintenance', 'zh-Hans': '维护', ja: '  ' }
    expect(resolveLocalized(text, 'zh-Hans')).toEqual({ locale: 'zh-Hans', value: '维护' })
    expect(resolveLocalized(text, 'zh-Hant')).toEqual({ locale: 'zh-Hans', value: '维护' })
    expect(resolveLocalized(text, 'ja')).toEqual({ locale: 'en', value: 'Maintenance' })
    expect(resolveLocalized(text, 'ms')).toEqual({ locale: 'en', value: 'Maintenance' })
    expect(resolveLocalized({ ja: 'x' }, 'ko')).toBeNull()
  })
})