import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import pg from 'pg'
import {
  setupTestServer,
  teardownTestServer,
  getBaseUrl,
  signUp,
  signIn,
  extractSessionCookie,
  cleanDatabase,
} from './setup.js'

describe('Authentication', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
  })

  it('sign up creates a new user', async () => {
    const res = await signUp('test@example.com', 'password123', 'Test User')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBeDefined()
    expect(body.user.email).toBe('test@example.com')
    expect(body.user.name).toBe('Test User')
    expect(body.user).not.toHaveProperty('role')
    expect(body.user.emailVerified).toBe(false)

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const persisted = await pool.query<{ role: string }>(
        `SELECT role::text FROM "user" WHERE email = 'test@example.com'`,
      )
      expect(persisted.rows).toEqual([{ role: 'user' }])
    } finally {
      await pool.end()
    }
  })

  it('overrides attempted registration role injection with the ordinary default', async () => {
    const res = await fetch(`${getBaseUrl()}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({
        email: 'self-promoter@example.com',
        password: 'password123',
        name: 'Self Promoter',
        role: 'admin',
      }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      user: { email: 'self-promoter@example.com' },
    })
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const users = await pool.query<{ role: string }>(
        `SELECT role::text FROM "user" WHERE email = 'self-promoter@example.com'`,
      )
      expect(users.rows).toEqual([{ role: 'user' }])
    } finally {
      await pool.end()
    }
  })

  it('rejects attempted persisted-role changes through the public user update route', async () => {
    const signUpRes = await signUp('role-updater@example.com', 'password123', 'Role Updater')
    const cookie = extractSessionCookie(signUpRes)
    const updateRes = await fetch(`${getBaseUrl()}/api/auth/update-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:5173' },
      body: JSON.stringify({ role: 'admin' }),
    })

    expect(updateRes.status).toBe(400)
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const users = await pool.query<{ role: string }>(
        `SELECT role::text FROM "user" WHERE email = 'role-updater@example.com'`,
      )
      expect(users.rows).toEqual([{ role: 'user' }])
    } finally {
      await pool.end()
    }
  })

  it('sign in returns session cookies', async () => {
    await signUp('test@example.com', 'password123', 'Test User')
    const res = await signIn('test@example.com', 'password123')
    expect(res.status).toBe(200)
    const cookie = extractSessionCookie(res)
    expect(cookie).toContain('dxrating')
  })

  it('sign in with wrong password fails', async () => {
    await signUp('test@example.com', 'password123', 'Test User')
    const res = await signIn('test@example.com', 'wrongpassword')
    expect(res.status).not.toBe(200)
  })

  it('get session with valid cookie returns user', async () => {
    await signUp('test@example.com', 'password123', 'Test User')
    const loginRes = await signIn('test@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)

    const sessionRes = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: cookie },
    })
    expect(sessionRes.status).toBe(200)
    const session = await sessionRes.json()
    expect(session.user.email).toBe('test@example.com')
    expect(session.user).not.toHaveProperty('role')
    expect(session.user).not.toHaveProperty('adminAuthorizationNotBefore')
    expect(session.session).not.toHaveProperty('adminAuthorizationIssuedAt')
    expect(JSON.stringify(session)).not.toContain('admin_authorization_')
  })

  it('get session without cookie returns null/unauthorized', async () => {
    const res = await fetch(`${getBaseUrl()}/api/auth/get-session`)
    const body = await res.json()
    // Better Auth returns null body when not authenticated
    expect(body === null || !body?.user).toBe(true)
  })

  it('keeps an unverified account persisted as admin out of ordinary auth session output', async () => {
    await signUp('unverified-admin@example.com', 'password123', 'Unverified Admin')
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const result = await pool.query<{ id: string; email_verified: boolean }>(
        `UPDATE "user"
            SET role = 'admin'
          WHERE email = 'unverified-admin@example.com'
        RETURNING id, email_verified`,
      )
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]?.email_verified).toBe(false)
    } finally {
      await pool.end()
    }

    const loginRes = await signIn('unverified-admin@example.com', 'password123')
    const cookie = extractSessionCookie(loginRes)
    const sessionRes = await fetch(`${getBaseUrl()}/api/auth/get-session`, {
      headers: { Cookie: cookie },
    })
    expect(sessionRes.status).toBe(200)
    const session = await sessionRes.json()
    expect(session.user).toMatchObject({
      email: 'unverified-admin@example.com',
      emailVerified: false,
    })
    expect(session.user).not.toHaveProperty('role')
  })

  it('does not install Better Auth administrator-management endpoints', async () => {
    const routeResponse = await fetch(`${getBaseUrl()}/api/auth/admin/set-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ userId: 'any-user', role: 'admin' }),
    })
    expect(routeResponse.status).toBe(404)

    const schemaResponse = await fetch(`${getBaseUrl()}/api/auth/open-api/generate-schema`)
    expect(schemaResponse.status).toBe(200)
    const schema = JSON.stringify(await schemaResponse.json())
    expect(schema).not.toContain('/admin/')
    expect(schema).not.toContain('set-role')
  })
})