import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  withLocaleQuery,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  detectServerLocale,
  normalizeDetectedLanguage,
  persistClientLocalePreference,
  toSupportedLocale,
} from '../locale'

describe('locale detection', () => {
  const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    })
    document.cookie = `${LOCALE_COOKIE_NAME}=; Max-Age=0; Path=/`
  })

  function createServerRequest(url: string, headers: Record<string, string>) {
    return {
      url,
      headers: {
        get(name: string) {
          return headers[name.toLowerCase()] ?? null
        },
      },
    } as Request
  }

  it('normalizes browser and HTTP language variants to supported locales', () => {
    expect(toSupportedLocale('en-US')).toBe('en')
    expect(toSupportedLocale('ja-JP')).toBe('ja')
    expect(toSupportedLocale('ko-KR')).toBe('ko')
    expect(toSupportedLocale('zh-CN')).toBe('zh-Hans')
    expect(toSupportedLocale('zh-SG')).toBe('zh-Hans')
    expect(toSupportedLocale('zh-TW')).toBe('zh-Hant')
    expect(toSupportedLocale('zh-HK')).toBe('zh-Hant')
    expect(toSupportedLocale('ms-MY')).toBe('ms')
    expect(toSupportedLocale('ms_SG')).toBe('ms')
    expect(toSupportedLocale('id-ID')).toBe('id')
    expect(toSupportedLocale('in')).toBe('id')
    expect(toSupportedLocale('fil-PH')).toBe('fil')
    expect(toSupportedLocale('tl')).toBe('fil')
    expect(toSupportedLocale('vi-VN')).toBe('vi')
    expect(toSupportedLocale('th-TH')).toBe('th')
    expect(toSupportedLocale('my-MM')).toBe('my')
    // A region subtag doesn't pick the language: Chinese in Malaysia stays Chinese, English in Malaysia stays English
    expect(toSupportedLocale('zh-MY')).toBe('zh-Hans')
    expect(toSupportedLocale('en-MY')).toBe('en')
    expect(toSupportedLocale('fr-FR')).toBeNull()
    expect(toSupportedLocale('constructor')).toBeNull()
    expect(normalizeDetectedLanguage('fr-FR')).toBe('en')
  })

  it('detects the server locale from querystring before cookie before Accept-Language', () => {
    const request = createServerRequest('https://dxrating.net/search?locale=zh-Hant', {
      cookie: `${LOCALE_COOKIE_NAME}=ja`,
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    })

    expect(detectServerLocale(request)).toBe('zh-Hant')
  })

  it('reads the SSR locale from the cookie when there is no querystring locale', () => {
    const request = createServerRequest('https://dxrating.net/search', {
      cookie: `other=value; ${LOCALE_COOKIE_NAME}=zh-Hans`,
      'accept-language': 'ja-JP,ja;q=0.9',
    })

    expect(detectServerLocale(request)).toBe('zh-Hans')
  })

  it('uses Accept-Language as the SSR fallback when no explicit preference exists', () => {
    const request = createServerRequest('https://dxrating.net/search', {
      'accept-language': 'fr-FR,zh-TW;q=0.9,en;q=0.5',
    })

    expect(detectServerLocale(request)).toBe('zh-Hant')
  })

  it('negotiates the maimai DX International languages from Accept-Language', () => {
    const request = createServerRequest('https://dxrating.net/search', {
      'accept-language': 'fr-FR,ms-MY;q=0.9,en;q=0.5',
    })

    expect(detectServerLocale(request)).toBe('ms')
  })

  it('persists the client locale preference to localStorage and the SSR cookie', () => {
    persistClientLocalePreference('zh-Hant')

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'zh-Hant')
    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=zh-Hant`)
  })
})

describe('withLocaleQuery', () => {
  it('carries a supported ?locale= of the search onto the path', () => {
    expect(withLocaleQuery('/songs/a/dx/master', { locale: 'ja' })).toBe('/songs/a/dx/master?locale=ja')
    expect(withLocaleQuery('/songs/a/dx/master', { locale: 'zh-Hant', q: 'x' })).toBe(
      '/songs/a/dx/master?locale=zh-Hant',
    )
  })

  it('leaves the path alone without a usable locale', () => {
    expect(withLocaleQuery('/songs/a/dx/master', {})).toBe('/songs/a/dx/master')
    expect(withLocaleQuery('/songs/a/dx/master', { locale: 'fr' })).toBe('/songs/a/dx/master')
    expect(withLocaleQuery('/songs/a/dx/master', { locale: 123 })).toBe('/songs/a/dx/master')
  })
})