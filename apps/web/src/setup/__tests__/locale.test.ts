import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  detectServerLocale,
  getClientLanguageDetectionOptions,
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
    expect(toSupportedLocale('zh-CN')).toBe('zh-Hans')
    expect(toSupportedLocale('zh-SG')).toBe('zh-Hans')
    expect(toSupportedLocale('zh-TW')).toBe('zh-Hant')
    expect(toSupportedLocale('zh-HK')).toBe('zh-Hant')
    expect(toSupportedLocale('fr-FR')).toBeNull()
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

  it('configures browser detection without automatic persistence side effects', () => {
    expect(getClientLanguageDetectionOptions()).toMatchObject({
      order: ['querystring', 'cookie', 'htmlTag', 'localStorage', 'sessionStorage', 'navigator'],
      lookupQuerystring: 'locale',
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      lookupSessionStorage: LOCALE_STORAGE_KEY,
      lookupCookie: LOCALE_COOKIE_NAME,
      caches: [],
      excludeCacheFor: ['cimode'],
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
      },
    })
  })

  it('persists the client locale preference to localStorage and the SSR cookie', () => {
    persistClientLocalePreference('zh-Hant')

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'zh-Hant')
    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=zh-Hant`)
  })
})