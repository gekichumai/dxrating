import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
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
  })

  it('get session without cookie returns null/unauthorized', async () => {
    const res = await fetch(`${getBaseUrl()}/api/auth/get-session`)
    const body = await res.json()
    // Better Auth returns null body when not authenticated
    expect(body === null || !body?.user).toBe(true)
  })
})
