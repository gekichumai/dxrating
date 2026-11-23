import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The default deployment before mail existed: no RESEND_API_KEY
vi.hoisted(() => {
  delete process.env.RESEND_API_KEY
})

import { config } from '../config'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, signIn, teardownTestServer } from './setup'
import { ORIGIN, register } from './webauthn'

beforeAll(setupTestServer)
beforeEach(cleanDatabase)
afterAll(teardownTestServer)

const auth = (path: string, body: unknown, cookie = '') =>
  fetch(`${getBaseUrl()}/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
    body: JSON.stringify(body),
  })

describe('without a mail provider', () => {
  it('turns mail off', () => {
    expect(config.email.transport).toBe('disabled')
  })

  it('still signs up with a password or a passkey, unverified', async () => {
    const response = await auth('/sign-up/email', { email: 'plain@example.com', password: 'password123', name: 'P' })
    expect(response.status).toBe(200)
    expect(((await response.json()) as { user: { emailVerified: boolean } }).user.emailVerified).toBe(false)
    expect((await register({ email: 'passkey@example.com' })).status).toBe(200)
    expect((await signIn('plain@example.com', 'password123')).status).toBe(200)
  })

  it('answers verification and password reset requests as not enabled', async () => {
    const cookie = extractSessionCookie(
      await auth('/sign-up/email', { email: 'off@example.com', password: 'password123', name: 'Off' }),
    )
    const verification = await auth('/send-verification-email', { email: 'off@example.com' }, cookie)
    expect(verification.status).toBe(400)
    expect(await verification.json()).toMatchObject({ code: 'VERIFICATION_EMAIL_NOT_ENABLED' })

    const reset = await auth('/request-password-reset', { email: 'off@example.com' })
    expect(reset.status).toBe(400)
    expect(await reset.json()).toMatchObject({ code: 'RESET_PASSWORD_DISABLED' })
  })
})