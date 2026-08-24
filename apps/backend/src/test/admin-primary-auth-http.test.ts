import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TEST_ADMIN_ACCESS_HEADERS } from './admin-access.js'
import {
  cleanDatabase,
  extractSessionCookie,
  getBaseUrl,
  setupTestServer,
  signUp,
  teardownTestServer,
} from './setup.js'

const ADMIN_ORIGIN = 'http://localhost:5174'

const createAdministrator = async (email: string) => {
  const signUpResponse = await signUp(email, 'password123', 'Step-up Administrator')
  const cookie = extractSessionCookie(signUpResponse)
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await database.query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [email])
  } finally {
    await database.end()
  }
  return cookie
}

const adminRequest = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(`${getBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...TEST_ADMIN_ACCESS_HEADERS,
      Cookie: cookie,
      Origin: ADMIN_ORIGIN,
      [ADMIN_CONTRACT_HEADER]: ADMIN_CONTRACT_COMPATIBILITY_ID,
      ...init.headers,
    },
  })

describe('administrator primary-authentication HTTP flow', () => {
  beforeAll(setupTestServer)
  afterAll(teardownTestServer)
  beforeEach(cleanDatabase)

  it('opens and reads a session-bound password window without exposing the password', async () => {
    const cookie = await createAdministrator('password-step-up@example.com')
    const response = await adminRequest('/api/admin/primary-auth/password', cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const completed = await response.json()
    expect(completed).toEqual({ completed: true, expiresAt: expect.any(String) })
    expect(JSON.stringify(completed)).not.toContain('password123')

    const statusResponse = await adminRequest('/api/admin/primary-auth/status', cookie)
    expect(statusResponse.status).toBe(200)
    await expect(statusResponse.json()).resolves.toEqual({ active: true, expiresAt: completed.expiresAt })

    const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const timestampsBefore = await database.query<{ completed_at: Date; expires_at: Date }>(
        'SELECT completed_at, expires_at FROM admin_primary_auth_windows',
      )
      await adminRequest('/api/admin/bootstrap', cookie)
      await adminRequest('/api/admin/primary-auth/status', cookie)
      const timestampsAfter = await database.query<{ completed_at: Date; expires_at: Date }>(
        'SELECT completed_at, expires_at FROM admin_primary_auth_windows',
      )
      expect(timestampsAfter.rows).toEqual(timestampsBefore.rows)
    } finally {
      await database.end()
    }
  })

  it('uses generic wrong/missing-credential failures and a database-backed rate limit', async () => {
    const cookie = await createAdministrator('password-rate-limit@example.com')

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await adminRequest('/api/admin/primary-auth/password', cookie, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: `wrong-password-${attempt}` }),
      })
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body).toMatchObject({ defined: true, code: 'STEP_UP_FAILED' })
      expect(JSON.stringify(body)).not.toContain('wrong-password')
      expect(JSON.stringify(body)).not.toContain('password-rate-limit@example.com')
    }

    const limited = await adminRequest('/api/admin/primary-auth/password', cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    })
    expect(limited.status).toBe(429)
    await expect(limited.json()).resolves.toMatchObject({
      defined: true,
      code: 'STEP_UP_RATE_LIMITED',
      message: 'Primary authentication could not be verified at this time',
    })

    const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      await database.query(`UPDATE account SET password = NULL WHERE provider_id = 'credential'`)
      await database.query('DELETE FROM admin_primary_auth_password_rate_limits')
    } finally {
      await database.end()
    }

    const missingCredential = await adminRequest('/api/admin/primary-auth/password', cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    })
    expect(missingCredential.status).toBe(401)
    await expect(missingCredential.json()).resolves.toMatchObject({
      defined: true,
      code: 'STEP_UP_FAILED',
      message: 'Primary authentication could not be verified',
    })
  })

  it('invalidates the window with its session and never sends callback credentials to the SPA', async () => {
    const cookie = await createAdministrator('session-step-up@example.com')
    const completed = await adminRequest('/api/admin/primary-auth/password', cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    })
    expect(completed.status).toBe(200)

    const callback = await fetch(
      `${getBaseUrl()}/api/admin/primary-auth/oauth/callback/github?state=${'s'.repeat(43)}&code=provider-secret-code`,
      {
        redirect: 'manual',
        headers: { ...TEST_ADMIN_ACCESS_HEADERS, Cookie: cookie },
      },
    )
    expect(callback.status).toBe(302)
    expect(callback.headers.get('Location')).toBe('http://localhost:5174/primary-auth/result?status=failure')
    expect(callback.headers.get('Location')).not.toContain('provider-secret-code')
    expect(callback.headers.get('Location')).not.toContain('state=')
    expect(callback.headers.get('Cache-Control')).toBe('private, no-store')
    expect(callback.headers.get('Referrer-Policy')).toBe('no-referrer')

    const signOut = await fetch(`${getBaseUrl()}/api/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: ADMIN_ORIGIN },
      body: '{}',
    })
    expect(signOut.status).toBe(200)

    const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const remaining = await database.query('SELECT session_id FROM admin_primary_auth_windows')
      expect(remaining.rowCount).toBe(0)
    } finally {
      await database.end()
    }

    const status = await adminRequest('/api/admin/primary-auth/status', cookie)
    expect(status.status).toBe(401)
    await expect(status.json()).resolves.toMatchObject({ defined: true, code: 'UNAUTHENTICATED' })
  })

  it('rejects GitHub destructive-action step-up before creating a challenge', async () => {
    const cookie = await createAdministrator('github-step-up-rejected@example.com')
    const response = await adminRequest('/api/admin/primary-auth/oauth/initiate', cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'github' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ defined: true, code: 'VALIDATION_FAILED' })

    const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const attempts = await database.query('SELECT provider FROM admin_primary_auth_oauth_attempts')
      expect(attempts.rowCount).toBe(0)
    } finally {
      await database.end()
    }
  })

  it('rejects password step-up from an untrusted origin before verification', async () => {
    const cookie = await createAdministrator('origin-step-up@example.com')
    const response = await adminRequest('/api/admin/primary-auth/password', cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
      body: JSON.stringify({ password: 'password123' }),
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ defined: true, code: 'FORBIDDEN' })

    const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const attempts = await database.query('SELECT user_id FROM admin_primary_auth_password_rate_limits')
      expect(attempts.rowCount).toBe(0)
    } finally {
      await database.end()
    }
  })
})