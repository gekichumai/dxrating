import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenericEndpointContext } from 'better-auth'
import { passkeySignUp } from '../lib/passkey-sign-up'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, signUp, teardownTestServer } from './setup'
import { register, registerOptions } from './webauthn'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

beforeAll(setupTestServer)
beforeEach(cleanDatabase)
afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

describe('passkey-first sign-up', () => {
  it('creates an account, its passkey and a session in one ceremony', async () => {
    const response = await register({ email: '  New.Player@Example.com ' })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      user: { id: string; email: string; name: string; emailVerified: boolean }
    }
    expect(body.user).toMatchObject({ email: 'new.player@example.com', name: 'new.player', emailVerified: false })

    const passkeys = await pool.query('SELECT user_id FROM passkey')
    expect(passkeys.rows).toEqual([{ user_id: body.user.id }])

    const session = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: extractSessionCookie(response) },
    })
    expect((await session.json()).user.id).toBe(body.user.id)
  })

  it('creates nothing when the ceremony is never finished', async () => {
    expect((await registerOptions({ context: JSON.stringify({ email: 'abandoned@example.com' }) })).status).toBe(200)
    expect((await pool.query('SELECT id FROM "user"')).rowCount).toBe(0)
  })

  it('refuses an email that already has an account, and never attaches a passkey to it', async () => {
    await signUp('taken@example.com', 'password123', 'Taken')
    const response = await registerOptions({ context: JSON.stringify({ email: 'Taken@example.com' }) })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'USER_ALREADY_EXISTS' })
    expect((await pool.query('SELECT id FROM passkey')).rowCount).toBe(0)
  })

  it('refuses a missing or malformed email', async () => {
    expect((await registerOptions({})).status).toBe(400)
    expect((await registerOptions({ context: JSON.stringify({ email: 'not-an-email' }) })).status).toBe(400)
    // A bare address, without the JSON envelope that carries the Turnstile token
    expect((await registerOptions({ context: 'bare@example.com' })).status).toBe(400)
  })
})

describe('passkey-first sign-up with Turnstile on', () => {
  const resolveUser = passkeySignUp({ turnstileSecretKey: 'test-secret' }).resolveUser
  const fakeContext = () => {
    const findUserByEmail = vi.fn().mockResolvedValue({ id: 'existing' })
    const ctx = {
      headers: new Headers(),
      context: { internalAdapter: { findUserByEmail }, generateId: () => 'new-user' },
    } as unknown as GenericEndpointContext
    return { ctx, findUserByEmail }
  }

  it('refuses a request without a token before saying anything about the address', async () => {
    const { ctx, findUserByEmail } = fakeContext()
    await expect(resolveUser({ ctx, context: JSON.stringify({ email: 'taken@example.com' }) })).rejects.toMatchObject({
      body: { code: 'MISSING_RESPONSE' },
    })
    // Without the check, the answer (422 USER_ALREADY_EXISTS or a challenge) would tell whether the address is taken
    expect(findUserByEmail).not.toHaveBeenCalled()
  })

  it('refuses a token Cloudflare rejects before saying anything about the address', async () => {
    const { ctx, findUserByEmail } = fakeContext()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success: false }))
    try {
      await expect(
        resolveUser({ ctx, context: JSON.stringify({ email: 'taken@example.com', captcha: 'bad-token' }) }),
      ).rejects.toMatchObject({ body: { code: 'VERIFICATION_FAILED' } })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(findUserByEmail).not.toHaveBeenCalled()
    } finally {
      fetchMock.mockRestore()
    }
  })
})

describe('adding a passkey while signed in', () => {
  const signedIn = async () => {
    const response = await signUp('owner@example.com', 'password123', 'Owner')
    const { user } = (await response.json()) as { user: { id: string } }
    return { id: user.id, cookie: extractSessionCookie(response) }
  }

  it('adds it to the signed-in account and creates no other', async () => {
    const owner = await signedIn()
    const response = await register({ cookie: owner.cookie })
    expect(response.status).toBe(200)
    expect((await pool.query('SELECT user_id FROM passkey')).rows).toEqual([{ user_id: owner.id }])
    expect((await pool.query('SELECT id FROM "user"')).rowCount).toBe(1)
  })

  it('still needs a fresh session', async () => {
    const owner = await signedIn()
    await pool.query("UPDATE session SET created_at = now() - interval '2 days' WHERE user_id = $1", [owner.id])
    const response = await registerOptions({}, owner.cookie)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' })
  })
})