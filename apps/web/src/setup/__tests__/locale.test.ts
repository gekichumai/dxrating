import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOCALE_COOKIE_NAME,
  LOCALE_PATH_PREFIXES,
  SUPPORTED_LOCALES,
  localizePath,
  negotiateLocale,
  splitLocalePath,
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

  it('renders the locale the URL path names, and English without a prefix', () => {
    const preferJa = { cookie: `${LOCALE_COOKIE_NAME}=ja`, 'accept-language': 'zh-CN,zh;q=0.9' }
    expect(detectServerLocale(createServerRequest('https://dxrating.net/zh-hant/search', preferJa))).toBe('zh-Hant')
    expect(detectServerLocale(createServerRequest('https://dxrating.net/ms', {}))).toBe('ms')
    // The preference only decides the redirect from an unprefixed URL; what renders there is English
    expect(detectServerLocale(createServerRequest('https://dxrating.net/search', preferJa))).toBe('en')
    expect(detectServerLocale(createServerRequest('https://dxrating.net/search?locale=ja', {}))).toBe('en')
  })

  it('negotiates the preferred locale: the cookie, then Accept-Language', () => {
    expect(
      negotiateLocale(
        createServerRequest('https://dxrating.net/', {
          cookie: `other=value; ${LOCALE_COOKIE_NAME}=zh-Hans`,
          'accept-language': 'ja-JP,ja;q=0.9',
        }),
      ),
    ).toBe('zh-Hans')
    expect(
      negotiateLocale(
        createServerRequest('https://dxrating.net/', { 'accept-language': 'fr-FR,ms-MY;q=0.9,en;q=0.5' }),
      ),
    ).toBe('ms')
    expect(negotiateLocale(createServerRequest('https://dxrating.net/', {}))).toBe('en')
  })

  it('persists the client locale preference to localStorage and the SSR cookie', () => {
    persistClientLocalePreference('zh-Hant')

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'zh-Hant')
    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=zh-Hant`)
  })
})

describe('locale paths', () => {
  it('splits a canonical lowercase prefix off the path', () => {
    expect(splitLocalePath('/ja/songs/a')).toEqual({ locale: 'ja', pathname: '/songs/a' })
    expect(splitLocalePath('/zh-hans')).toEqual({ locale: 'zh-Hans', pathname: '/' })
    expect(splitLocalePath('/songs/a')).toEqual({ locale: 'en', pathname: '/songs/a' })
    // Not prefixes: other casing and /en are redirected by the server, and a segment that only starts like one
    expect(splitLocalePath('/zh-Hans/x')).toEqual({ locale: 'en', pathname: '/zh-Hans/x' })
    expect(splitLocalePath('/en/x')).toEqual({ locale: 'en', pathname: '/en/x' })
    expect(splitLocalePath('/japan')).toEqual({ locale: 'en', pathname: '/japan' })
  })

  it('builds the URL of a path in a locale', () => {
    expect(localizePath('/songs/a?x=1#h', 'zh-Hant')).toBe('/zh-hant/songs/a?x=1#h')
    expect(localizePath('/', 'th')).toBe('/th')
    expect(localizePath('/?q=x', 'th')).toBe('/th?q=x')
    expect(localizePath('/songs/a', 'en')).toBe('/songs/a')
  })

  it('gives every locale but English a lowercase prefix', () => {
    expect(Object.keys(LOCALE_PATH_PREFIXES).sort()).toEqual(SUPPORTED_LOCALES.filter((l) => l !== 'en').sort())
    for (const prefix of Object.values(LOCALE_PATH_PREFIXES)) expect(prefix).toBe(prefix.toLowerCase())
  })
})