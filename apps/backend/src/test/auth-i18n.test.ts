import { SUPPORTED_LOCALES } from '@gekichumai/api-contract'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localizeAuthError } from '../lib/auth-error-localization'
import { AUTH_ERROR_CODES, AUTH_ERROR_TRANSLATIONS } from '../lib/auth-error-translations'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, signUp, teardownTestServer } from './setup'
import { ORIGIN } from './webauthn'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

beforeAll(setupTestServer)
beforeEach(cleanDatabase)
afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

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

  it('follow the page language the web sends as Accept-Language, over the language cookie', async () => {
    const body = await failedSignIn({ 'Accept-Language': 'ja', Cookie: 'dxrating.locale=en' })
    expect(body).toEqual(
      expect.objectContaining({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: AUTH_ERROR_TRANSLATIONS.ja.INVALID_EMAIL_OR_PASSWORD,
      }),
    )
  })

  it('stay English on an English page, whatever the cookie says', async () => {
    const body = await failedSignIn({ 'Accept-Language': 'en', Cookie: 'dxrating.locale=ja' })
    expect(body.message).toBe('Invalid email or password')
  })

  it.each(SUPPORTED_LOCALES.filter((locale) => locale !== 'en'))('are translated into %s', async (locale) => {
    const body = await failedSignIn({ 'Accept-Language': locale })
    expect(body.message).toBe(AUTH_ERROR_TRANSLATIONS[locale].INVALID_EMAIL_OR_PASSWORD)
  })

  it('read browser language tags, and fall back to the language cookie when they name no language we have', async () => {
    expect((await failedSignIn({ 'Accept-Language': 'zh-TW,zh;q=0.9' })).message).toBe(
      AUTH_ERROR_TRANSLATIONS['zh-Hant'].INVALID_EMAIL_OR_PASSWORD,
    )
    expect((await failedSignIn({ 'Accept-Language': 'fr-FR, ms-MY;q=0.8' })).message).toBe(
      AUTH_ERROR_TRANSLATIONS.ms.INVALID_EMAIL_OR_PASSWORD,
    )
    expect((await failedSignIn({ 'Accept-Language': 'fr-FR', Cookie: 'dxrating.locale=ko' })).message).toBe(
      AUTH_ERROR_TRANSLATIONS.ko.INVALID_EMAIL_OR_PASSWORD,
    )
    expect((await failedSignIn({ 'Accept-Language': 'xx' })).message).toBe('Invalid email or password')
  })

  it('are translated when a before-hook refuses the request: adding a passkey on a stale session', async () => {
    const response = await signUp('owner@example.com', 'password123', 'Owner')
    const { user } = (await response.json()) as { user: { id: string } }
    await pool.query("UPDATE session SET created_at = now() - interval '2 days' WHERE user_id = $1", [user.id])
    const refused = await fetch(`${getBaseUrl()}/api/auth/passkey/generate-register-options`, {
      headers: { Origin: ORIGIN, Cookie: extractSessionCookie(response), 'Accept-Language': 'ja' },
    })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({
      code: 'SESSION_NOT_FRESH',
      message: AUTH_ERROR_TRANSLATIONS.ja.SESSION_NOT_FRESH,
    })
  })
})

describe('localizeAuthError', () => {
  const japanese = new Headers({ 'Accept-Language': 'ja' })
  const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

  it("gives the rate limiter's 429 a code and translates it", async () => {
    // What Better Auth's rate limiter answers from onRequest, before any hook runs
    const response = await localizeAuthError(
      japanese,
      json({ message: 'Too many requests. Please try again later.' }, 429, { 'X-Retry-After': '10' }),
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('X-Retry-After')).toBe('10')
    expect(await response.json()).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: AUTH_ERROR_TRANSLATIONS.ja.TOO_MANY_REQUESTS,
      originalMessage: 'Too many requests. Please try again later.',
    })
    const english = await localizeAuthError(new Headers(), json({ message: 'Too many requests.' }, 429))
    expect(await english.json()).toEqual({ code: 'TOO_MANY_REQUESTS', message: 'Too many requests.' })
  })

  it("translates the captcha plugin's answers", async () => {
    for (const code of ['MISSING_RESPONSE', 'VERIFICATION_FAILED'] as const) {
      const response = await localizeAuthError(japanese, json({ code, message: 'Captcha' }, 400))
      expect(await response.json()).toMatchObject({ code, message: AUTH_ERROR_TRANSLATIONS.ja[code] })
    }
  })

  it('leaves successes, English, unknown codes and other bodies alone', async () => {
    const ok = json({ status: true }, 200)
    expect(await localizeAuthError(japanese, ok)).toBe(ok)
    const english = json({ code: 'INVALID_PASSWORD', message: 'Invalid password' }, 400)
    expect(await localizeAuthError(new Headers({ 'Accept-Language': 'en' }), english)).toBe(english)
    const unknown = json({ code: 'SOMETHING_ELSE', message: 'Something else' }, 400)
    expect(await localizeAuthError(japanese, unknown)).toBe(unknown)
    const text = new Response('Not found', { status: 404 })
    expect(await localizeAuthError(japanese, text)).toBe(text)
  })

  it('keeps every Set-Cookie header', async () => {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    headers.append('Set-Cookie', 'a=1')
    headers.append('Set-Cookie', 'b=2')
    const response = await localizeAuthError(
      japanese,
      new Response(JSON.stringify({ code: 'INVALID_PASSWORD', message: 'Invalid password' }), { status: 400, headers }),
    )
    expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
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