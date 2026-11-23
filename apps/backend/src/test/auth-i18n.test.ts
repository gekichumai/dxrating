import { LOCALE_HEADER, SUPPORTED_LOCALES } from '@gekichumai/api-contract'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AUTH_ERROR_CODES, AUTH_ERROR_TRANSLATIONS } from '../lib/auth-error-translations'
import { cleanDatabase, getBaseUrl, setupTestServer, signUp, teardownTestServer } from './setup'

beforeAll(setupTestServer)
beforeEach(cleanDatabase)
afterAll(teardownTestServer)

/** A sign-in with the wrong password; answers INVALID_EMAIL_OR_PASSWORD */
const failedSignIn = async (headers: Record<string, string>) => {
  const response = await fetch(`${getBaseUrl()}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email: 'player@example.com', password: 'wrong-password' }),
  })
  expect(response.status).toBe(401)
  return (await response.json()) as { code: string; message: string }
}

describe('Better Auth error messages', () => {
  beforeEach(async () => {
    await signUp('player@example.com', 'right-password', 'Player')
  })

  it('follow the page language the web names, over the language cookie and Accept-Language', async () => {
    const body = await failedSignIn({
      [LOCALE_HEADER]: 'ja',
      Cookie: 'dxrating.locale=en',
      'Accept-Language': 'en-US,en;q=0.9',
    })
    expect(body).toEqual(
      expect.objectContaining({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: AUTH_ERROR_TRANSLATIONS.ja.INVALID_EMAIL_OR_PASSWORD,
      }),
    )
  })

  it('stay English on an English page, whatever the cookie says', async () => {
    const body = await failedSignIn({ [LOCALE_HEADER]: 'en', Cookie: 'dxrating.locale=ja' })
    expect(body.message).toBe('Invalid email or password')
  })

  it.each(SUPPORTED_LOCALES.filter((locale) => locale !== 'en'))('are translated into %s', async (locale) => {
    const body = await failedSignIn({ [LOCALE_HEADER]: locale })
    expect(body.message).toBe(AUTH_ERROR_TRANSLATIONS[locale].INVALID_EMAIL_OR_PASSWORD)
  })

  it('fall back to the language cookie, then Accept-Language, for clients that name no page language', async () => {
    expect((await failedSignIn({ Cookie: 'dxrating.locale=ko' })).message).toBe(
      AUTH_ERROR_TRANSLATIONS.ko.INVALID_EMAIL_OR_PASSWORD,
    )
    expect((await failedSignIn({ 'Accept-Language': 'zh-TW,zh;q=0.9' })).message).toBe(
      AUTH_ERROR_TRANSLATIONS['zh-Hant'].INVALID_EMAIL_OR_PASSWORD,
    )
    expect((await failedSignIn({ 'Accept-Language': 'fr-FR, ms-MY;q=0.8' })).message).toBe(
      AUTH_ERROR_TRANSLATIONS.ms.INVALID_EMAIL_OR_PASSWORD,
    )
    expect((await failedSignIn({ [LOCALE_HEADER]: 'xx' })).message).toBe('Invalid email or password')
  })

  it('let the web send the page language across origins', async () => {
    const response = await fetch(`${getBaseUrl()}/api/auth/sign-in/email`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dxrating.net',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': `content-type,${LOCALE_HEADER.toLowerCase()}`,
      },
    })
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(LOCALE_HEADER.toLowerCase())
  })
})

describe('AUTH_ERROR_TRANSLATIONS', () => {
  it('translates every code the web shows into every language but English', () => {
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === 'en') continue
      for (const code of AUTH_ERROR_CODES) {
        expect(AUTH_ERROR_TRANSLATIONS[locale][code]?.trim(), `${locale} ${code}`).toBeTruthy()
      }
    }
  })
})