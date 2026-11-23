import { SET_PASSWORD_AUTH_PATH } from '@gekichumai/api-contract'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PWNED_PASSWORD_PATHS } from '../auth'
import {
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signIn,
  signUp,
  teardownTestServer,
} from './setup'
import { ORIGIN, register } from './webauthn'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

beforeAll(setupTestServer)
beforeEach(cleanDatabase)
afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

const setPassword = (cookie: string, newPassword: string) =>
  fetch(`${getBaseUrl()}/api/auth${SET_PASSWORD_AUTH_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
    body: JSON.stringify({ newPassword }),
  })

/** An account created with a passkey: no password, signed in */
const passkeyOnlyAccount = async (email = 'passkey@example.com') => {
  const response = await register({ email })
  expect(response.status).toBe(200)
  const { user } = (await response.json()) as { user: { id: string } }
  return { id: user.id, email, cookie: extractSessionCookie(response) }
}

const credentialAccounts = async (userId: string) =>
  (await pool.query("SELECT id FROM account WHERE user_id = $1 AND provider_id = 'credential'", [userId])).rowCount

describe('setting a first password', () => {
  it('gives a passkey-only account a password it can then sign in with, once', async () => {
    const account = await passkeyOnlyAccount()
    expect(await credentialAccounts(account.id)).toBe(0)

    const response = await setPassword(account.cookie, 'a-new-password')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: true })
    expect(await credentialAccounts(account.id)).toBe(1)
    expect((await signIn(account.email, 'a-new-password')).status).toBe(200)

    const again = await setPassword(account.cookie, 'another-password')
    expect(again.status).toBe(400)
    expect(await again.json()).toMatchObject({ code: 'PASSWORD_ALREADY_SET' })
    expect(await credentialAccounts(account.id)).toBe(1)
    expect((await signIn(account.email, 'another-password')).status).toBe(401)
  })

  it('refuses an account that already has a password', async () => {
    const response = await signUp('owner@example.com', 'password123', 'Owner')
    const { user } = (await response.json()) as { user: { id: string } }
    const refused = await setPassword(extractSessionCookie(response), 'a-new-password')
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ code: 'PASSWORD_ALREADY_SET' })
    expect((await signIn('owner@example.com', 'password123')).status).toBe(200)
    expect(await credentialAccounts(user.id)).toBe(1)
  })

  it('refuses a session that is not fresh', async () => {
    const account = await passkeyOnlyAccount()
    await pool.query("UPDATE session SET created_at = now() - interval '2 days' WHERE user_id = $1", [account.id])
    const response = await setPassword(account.cookie, 'a-new-password')
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' })
    expect(await credentialAccounts(account.id)).toBe(0)
  })

  it('refuses a visitor who is not signed in', async () => {
    const response = await setPassword('', 'a-new-password')
    expect(response.status).toBe(401)
  })

  it('keeps to the sign-up password length rules', async () => {
    const account = await passkeyOnlyAccount()
    const short = await setPassword(account.cookie, 'short')
    expect(short.status).toBe(400)
    expect(await short.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    const long = await setPassword(account.cookie, 'x'.repeat(129))
    expect(long.status).toBe(400)
    expect(await long.json()).toMatchObject({ code: 'PASSWORD_TOO_LONG' })
    expect(await credentialAccounts(account.id)).toBe(0)
  })

  it('has haveIBeenPwned check the new password', () => {
    // The plugin is off in tests (it calls a remote API); this keeps the path on its list
    expect(PWNED_PASSWORD_PATHS).toContain(SET_PASSWORD_AUTH_PATH)
  })
})