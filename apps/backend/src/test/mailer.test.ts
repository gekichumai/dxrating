import { SUPPORTED_LOCALES } from '@gekichumai/api-contract'
import { Effect, Exit, Layer, ManagedRuntime } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { resolveEmailSettings } from '../config'
import { createMailThrottle, webPageUrl, withCallbackUrl } from '../lib/auth-mail'
import { renderAuthMail } from '../lib/auth-mail-templates'
import { HttpClientLive } from '../services/http-client'
import { MailerError, RESEND_EMAILS_URL, sendWithResend, type Mail } from '../services/mailer'

const mail: Mail = {
  to: 'player@example.com',
  subject: 'Subject',
  text: 'Text',
  html: '<p>Text</p>',
  kind: 'verify_email',
}
const credentials = { apiKey: 're_test_key', from: 'DXRating <no-reply@dxrating.net>' }

describe('Resend transport', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const runtime = ManagedRuntime.make(
    HttpClientLive.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchMock))),
  )
  afterAll(() => runtime.dispose())

  it('posts the message to the Resend API with the key', async () => {
    fetchMock.mockReset().mockImplementation(async () => Response.json({ id: 'email-id' }))
    await runtime.runPromise(sendWithResend(credentials, mail))

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit]
    expect(String(url)).toBe(RESEND_EMAILS_URL)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer re_test_key')
    expect(JSON.parse(new TextDecoder().decode(init.body as Uint8Array))).toEqual({
      from: credentials.from,
      to: ['player@example.com'],
      subject: 'Subject',
      text: 'Text',
      html: '<p>Text</p>',
      tags: [{ name: 'kind', value: 'verify_email' }],
    })
  })

  it('fails with the status and the error name Resend answers, and nothing else', async () => {
    fetchMock
      .mockReset()
      .mockImplementation(async () =>
        Response.json({ name: 'validation_error', message: 'Invalid `to` field: player@example.com' }, { status: 422 }),
      )
    const error = await runtime.runPromise(Effect.flip(sendWithResend(credentials, mail)))
    expect(error).toBeInstanceOf(MailerError)
    expect(error).toMatchObject({ kind: 'verify_email', status: 422, cause: 'validation_error' })
  })

  it('fails when Resend cannot be reached', async () => {
    fetchMock.mockReset().mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })
    const exit = await runtime.runPromiseExit(sendWithResend(credentials, mail))
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe('email settings', () => {
  it('sends with Resend when a key is set, and nothing otherwise', () => {
    expect(resolveEmailSettings({ RESEND_API_KEY: 're_key', EMAIL_FROM: 'a <a@b.c>' })).toEqual({
      transport: 'resend',
      resendApiKey: 're_key',
      from: 'a <a@b.c>',
    })
    expect(resolveEmailSettings({ EMAIL_FROM: 'a <a@b.c>' }).transport).toBe('disabled')
  })
})

describe('account email templates', () => {
  it('has both messages in every language, naming the address and carrying the link', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const kind of ['verify_email', 'reset_password'] as const) {
        const rendered = renderAuthMail({
          kind,
          locale,
          email: 'player@example.com',
          url: 'https://api.dxrating.net/api/auth/verify-email?token=t&callbackURL=x',
          expiresInHours: 24,
        })
        expect(rendered.subject.trim(), `${locale} ${kind}`).not.toBe('')
        expect(rendered.text).toContain('player@example.com')
        expect(rendered.text).toContain('https://api.dxrating.net/api/auth/verify-email?token=t&callbackURL=x')
        expect(rendered.text).toContain('24')
        expect(rendered.html).toContain(`lang="${locale}"`)
        expect(rendered.html).toContain('token=t&amp;callbackURL=x')
      }
    }
  })

  it('escapes what it puts into the HTML and loads nothing remote', () => {
    const rendered = renderAuthMail({
      kind: 'reset_password',
      locale: 'en',
      email: '"<script>"@example.com',
      url: 'https://example.com/?a="b"',
      expiresInHours: 1,
    })
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('&quot;&lt;script&gt;&quot;@example.com')
    expect(rendered.html).not.toMatch(/<img|<script|src=/i)
    expect(rendered.text).toContain('The link works for 1 hour.')
  })
})

describe('account email links', () => {
  it('points at the web page in the visitor language', () => {
    expect(webPageUrl('https://dxrating.net', 'en', '/account/verify-email')).toBe(
      'https://dxrating.net/account/verify-email',
    )
    expect(webPageUrl('https://dxrating.net', 'zh-Hans', '/account/verify-email')).toBe(
      'https://dxrating.net/zh-hans/account/verify-email',
    )
  })

  it('replaces the callback a client asked for', () => {
    const link = withCallbackUrl(
      'https://api.dxrating.net/api/auth/verify-email?token=abc&callbackURL=https%3A%2F%2Fevil.example',
      'https://dxrating.net/ja/account/verify-email',
    )
    const url = new URL(link)
    expect(url.searchParams.get('token')).toBe('abc')
    expect(url.searchParams.getAll('callbackURL')).toEqual(['https://dxrating.net/ja/account/verify-email'])
  })

  it('mails one address a few times per window, then again after it', () => {
    const allow = createMailThrottle({ max: 2, windowMs: 1000 })
    expect(allow('verify_email:a@example.com', 0)).toBe(true)
    expect(allow('verify_email:a@example.com', 10)).toBe(true)
    expect(allow('verify_email:a@example.com', 20)).toBe(false)
    expect(allow('reset_password:a@example.com', 20)).toBe(true)
    expect(allow('verify_email:b@example.com', 20)).toBe(true)
    expect(allow('verify_email:a@example.com', 1001)).toBe(true)
  })
})