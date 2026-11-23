import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// config.ts reads the environment once, at import: keep sent mail in the in-memory outbox
vi.hoisted(() => {
  process.env.EMAIL_TRANSPORT = 'memory'
})

import { MAIL_THROTTLE_MAX } from '../lib/auth-mail'
import { memoryOutbox, type Mail } from '../services/mailer'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, signIn, teardownTestServer } from './setup'
import { ORIGIN, register } from './webauthn'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

beforeAll(setupTestServer)
beforeEach(async () => {
  await cleanDatabase()
  memoryOutbox.clear()
})
afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

const auth = (path: string, init: { body?: unknown; cookie?: string; language?: string } = {}) =>
  fetch(`${getBaseUrl()}/api/auth${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(init.cookie ? { Cookie: init.cookie } : {}),
      ...(init.language ? { 'Accept-Language': init.language } : {}),
    },
    body: JSON.stringify(init.body ?? {}),
  })

const signUpAs = (email: string, language?: string) =>
  auth('/sign-up/email', { body: { email, password: 'password123', name: 'Player' }, language })

/** Mail goes out in the background: waits until `address` has received `count` messages */
const mailTo = async (address: string, count = 1) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const received = memoryOutbox.to(address)
    if (received.length >= count) return received
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`${address} received ${memoryOutbox.to(address).length} of ${count} messages`)
}

/** Waits a moment longer than a background send takes, for asserting that nothing was sent */
const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

/** The link in a message: the line after the action, in the plain-text body */
const linkOf = (mail: Mail) => {
  const link = mail.text.split('\n').find((line) => line.startsWith('http'))
  if (!link) throw new Error('No link in the message')
  expect(mail.html).toContain(link.replaceAll('&', '&amp;'))
  return new URL(link)
}

const recordOf = async (email: string) =>
  (
    await pool.query<{
      id: string
      email_verified: boolean
      email_verified_at: Date | null
      email_verification_method: string | null
    }>('SELECT id, email_verified, email_verified_at, email_verification_method FROM "user" WHERE email = $1', [email])
  ).rows[0]

const sessionUser = async (cookie: string) => {
  const response = await fetch(`${getBaseUrl()}/api/auth/get-session`, { headers: { Cookie: cookie } })
  return ((await response.json()) as { user?: { id: string; emailVerified: boolean } } | null)?.user ?? null
}

describe('verification mail', () => {
  it('mails one link on email sign-up, in the visitor language, that verifies the address and signs in', async () => {
    const response = await signUpAs('new@example.com', 'ja')
    expect(response.status).toBe(200)

    const [mail, ...others] = await mailTo('new@example.com')
    expect(others).toEqual([])
    expect(mail).toMatchObject({ kind: 'verify_email', subject: 'DXRating のメールアドレスを確認してください' })
    expect(mail!.text).toContain('new@example.com')
    const link = linkOf(mail!)
    expect(`${link.origin}${link.pathname}`).toBe(`${getBaseUrl()}/api/auth/verify-email`)
    expect(link.searchParams.get('callbackURL')).toBe('http://localhost:5173/ja/account/verify-email')
    expect(await recordOf('new@example.com')).toMatchObject({ email_verified: false, email_verified_at: null })

    const verified = await fetch(link, { redirect: 'manual' })
    expect(verified.status).toBe(302)
    expect(verified.headers.get('location')).toBe('http://localhost:5173/ja/account/verify-email')
    const record = await recordOf('new@example.com')
    expect(record).toMatchObject({ email_verified: true, email_verification_method: 'email_link' })
    expect(record!.email_verified_at).toBeInstanceOf(Date)
    // autoSignInAfterVerification: the link signs its holder in
    expect(await sessionUser(extractSessionCookie(verified))).toMatchObject({ id: record!.id, emailVerified: true })
  })

  it('mails a passkey sign-up too, but not a signed-in visitor adding a passkey', async () => {
    const response = await register({ email: 'passkey@example.com' })
    expect(response.status).toBe(200)
    const [mail] = await mailTo('passkey@example.com')
    expect(mail!.subject).toBe('Confirm your email address for DXRating')
    expect(linkOf(mail!).searchParams.get('callbackURL')).toBe('http://localhost:5173/account/verify-email')

    const another = await register({ cookie: extractSessionCookie(response) })
    expect(another.status).toBe(200)
    await settle()
    expect(memoryOutbox.to('passkey@example.com')).toHaveLength(1)
  })

  it('sends nothing for a failed sign-up', async () => {
    await signUpAs('taken@example.com')
    await mailTo('taken@example.com')
    expect((await signUpAs('taken@example.com')).status).toBe(422)
    await settle()
    expect(memoryOutbox.to('taken@example.com')).toHaveLength(1)
  })

  it('resends a link to a signed-in, unverified account, landing on the web page whatever the client asked for', async () => {
    const cookie = extractSessionCookie(await signUpAs('resend@example.com'))
    await mailTo('resend@example.com')

    const response = await auth('/send-verification-email', {
      cookie,
      language: 'zh-Hant',
      body: { email: 'resend@example.com', callbackURL: 'http://localhost:5173/somewhere-else' },
    })
    expect(response.status).toBe(200)
    const [, mail] = await mailTo('resend@example.com', 2)
    expect(mail!.subject).toBe('請驗證你的 DXRating 電子信箱')
    expect(linkOf(mail!).searchParams.get('callbackURL')).toBe('http://localhost:5173/zh-hant/account/verify-email')

    await fetch(linkOf(mail!), { redirect: 'manual' })
    expect(await recordOf('resend@example.com')).toMatchObject({
      email_verified: true,
      email_verification_method: 'email_link',
    })
    const again = await auth('/send-verification-email', { cookie, body: { email: 'resend@example.com' } })
    expect(again.status).toBe(400)
    expect(await again.json()).toMatchObject({ code: 'EMAIL_ALREADY_VERIFIED' })
  })

  it('keeps the first verification time when an older link is used later', async () => {
    const cookie = extractSessionCookie(await signUpAs('twice@example.com'))
    await auth('/send-verification-email', { cookie, body: { email: 'twice@example.com' } })
    const [first, second] = await mailTo('twice@example.com', 2)
    await fetch(linkOf(second!), { redirect: 'manual' })
    const verified = await recordOf('twice@example.com')
    await fetch(linkOf(first!), { redirect: 'manual' })
    expect(await recordOf('twice@example.com')).toEqual(verified)
  })

  it('redirects a broken link to the web page with the error', async () => {
    await signUpAs('broken@example.com')
    const link = linkOf((await mailTo('broken@example.com'))[0]!)
    link.searchParams.set('token', 'not-a-token')
    const response = await fetch(link, { redirect: 'manual' })
    expect(response.headers.get('location')).toBe('http://localhost:5173/account/verify-email?error=INVALID_TOKEN')
    expect(await recordOf('broken@example.com')).toMatchObject({ email_verified: false })
  })

  it(`mails one address at most ${MAIL_THROTTLE_MAX} times in a row`, async () => {
    const cookie = extractSessionCookie(await signUpAs('flood@example.com'))
    for (let index = 0; index < MAIL_THROTTLE_MAX + 2; index++) {
      expect((await auth('/send-verification-email', { cookie, body: { email: 'flood@example.com' } })).status).toBe(
        200,
      )
    }
    await settle()
    expect(memoryOutbox.to('flood@example.com')).toHaveLength(MAIL_THROTTLE_MAX)
  })
})

describe('password reset', () => {
  it('mails a link that sets a new password and signs every device out', async () => {
    const cookie = extractSessionCookie(await signUpAs('reset@example.com'))
    const otherDevice = extractSessionCookie(await signIn('reset@example.com', 'password123'))
    expect(await sessionUser(otherDevice)).not.toBeNull()

    const requested = await auth('/request-password-reset', {
      language: 'ko',
      body: { email: 'reset@example.com', redirectTo: 'http://localhost:5173/elsewhere' },
    })
    expect(requested.status).toBe(200)
    const mail = (await mailTo('reset@example.com')).find((message) => message.kind === 'reset_password')!
    expect(mail.subject).toBe('DXRating 비밀번호 재설정')
    const link = linkOf(mail)
    expect(link.pathname.startsWith('/api/auth/reset-password/')).toBe(true)
    expect(link.searchParams.get('callbackURL')).toBe('http://localhost:5173/ko/account/reset-password')

    // Better Auth checks the token, then hands it to the web's page
    const landed = await fetch(link, { redirect: 'manual' })
    expect(landed.status).toBe(302)
    const page = new URL(landed.headers.get('location')!)
    expect(`${page.origin}${page.pathname}`).toBe('http://localhost:5173/ko/account/reset-password')
    const token = page.searchParams.get('token')!
    expect(token).toBeTruthy()

    const reset = await auth('/reset-password', { body: { token, newPassword: 'a-brand-new-password' } })
    expect(reset.status).toBe(200)
    expect(await sessionUser(cookie)).toBeNull()
    expect(await sessionUser(otherDevice)).toBeNull()
    expect((await signIn('reset@example.com', 'password123')).status).toBe(401)
    expect((await signIn('reset@example.com', 'a-brand-new-password')).status).toBe(200)

    // A token works once
    const reused = await auth('/reset-password', { body: { token, newPassword: 'yet-another-password' } })
    expect(reused.status).toBe(400)
    expect(await reused.json()).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('answers the same for an unknown address and mails nothing', async () => {
    const response = await auth('/request-password-reset', { body: { email: 'nobody@example.com' } })
    expect(response.status).toBe(200)
    await settle()
    expect(memoryOutbox.to('nobody@example.com')).toEqual([])
  })

  it('sends an expired or unknown token back to the web page with an error', async () => {
    const response = await fetch(
      `${getBaseUrl()}/api/auth/reset-password/unknown-token?callbackURL=${encodeURIComponent('http://localhost:5173/account/reset-password')}`,
      { redirect: 'manual' },
    )
    expect(response.headers.get('location')).toBe('http://localhost:5173/account/reset-password?error=INVALID_TOKEN')
  })
})