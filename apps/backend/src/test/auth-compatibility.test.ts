import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, teardownTestServer } from './setup'

vi.mock('better-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth')>()
  return {
    ...actual,
    // Better Auth skips origin checks in NODE_ENV=test by default. Exercise the
    // same origin validation as production while retaining its real handler.
    betterAuth: (options: Parameters<typeof actual.betterAuth>[0]) =>
      actual.betterAuth({ ...options, advanced: { ...options.advanced, disableOriginCheck: false } }),
  }
})

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const createUser = async () => {
  const response = await fetch(`${getBaseUrl()}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ email: `${randomUUID()}@example.invalid`, password: 'password123', name: 'Unlink fixture' }),
  })
  expect(response.status).toBe(200)
  const { user } = await response.json()
  return { id: user.id as string, cookie: extractSessionCookie(response) }
}

const linkAccount = async (userId: string, providerId = 'github') => {
  const id = randomUUID()
  const remoteId = randomUUID()
  await pool.query(
    'INSERT INTO account (id, account_id, provider_id, user_id, updated_at) VALUES ($1, $2, $3, $4, now())',
    [id, remoteId, providerId, userId],
  )
  return { id, remoteId, providerId }
}

const unlink = (cookie: string, body: object, origin = 'http://localhost:5173') =>
  fetch(`${getBaseUrl()}/api/auth/unlink-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  })

const accountExists = async (id: string) =>
  (await pool.query('SELECT id FROM account WHERE id = $1', [id])).rowCount === 1

beforeAll(setupTestServer)
beforeEach(cleanDatabase)
afterAll(async () => {
  await pool.end()
  await teardownTestServer()
})

describe('Better Auth unlink compatibility', () => {
  it('accepts the legacy provider-only request', async () => {
    const user = await createUser()
    const account = await linkAccount(user.id)
    const response = await unlink(user.cookie, { providerId: account.providerId })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: true })
    expect(await accountExists(account.id)).toBe(false)
  })

  it('uses the legacy remote account ID to select the right account for a provider', async () => {
    const user = await createUser()
    const first = await linkAccount(user.id)
    const second = await linkAccount(user.id)
    const response = await unlink(user.cookie, { providerId: second.providerId, accountId: second.remoteId })
    expect(response.status).toBe(200)
    expect(await accountExists(first.id)).toBe(true)
    expect(await accountExists(second.id)).toBe(false)
  })

  it('accepts the modern local account ID request', async () => {
    const user = await createUser()
    const account = await linkAccount(user.id)
    const response = await unlink(user.cookie, { accountId: account.id })
    expect(response.status).toBe(200)
    expect(await accountExists(account.id)).toBe(false)
  })

  it('does not reinterpret an unmatched legacy remote ID as a modern local ID', async () => {
    const user = await createUser()
    const account = await linkAccount(user.id)
    const response = await unlink(user.cookie, { providerId: account.providerId, accountId: account.id })
    expect(response.status).toBe(400)
    expect(await accountExists(account.id)).toBe(true)
  })

  for (const format of ['legacy', 'modern'] as const) {
    const requestBody = (account: Awaited<ReturnType<typeof linkAccount>>) =>
      format === 'legacy' ? { providerId: account.providerId, accountId: account.remoteId } : { accountId: account.id }

    it(`rejects ${format} requests for another user's account`, async () => {
      const user = await createUser()
      await linkAccount(user.id)
      const other = await createUser()
      const account = await linkAccount(other.id)
      const response = await unlink(user.cookie, requestBody(account))
      expect(response.status).toBe(400)
      expect(await accountExists(account.id)).toBe(true)
    })

    it(`preserves the last-account safeguard for ${format} requests`, async () => {
      const user = await createUser()
      const account = await linkAccount(user.id)
      await pool.query('DELETE FROM account WHERE user_id = $1 AND id <> $2', [user.id, account.id])
      const response = await unlink(user.cookie, requestBody(account))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'FAILED_TO_UNLINK_LAST_ACCOUNT' })
      expect(await accountExists(account.id)).toBe(true)
    })

    it(`rejects unauthenticated ${format} requests`, async () => {
      const user = await createUser()
      const account = await linkAccount(user.id)
      const response = await unlink('', requestBody(account))
      expect(response.status).toBe(401)
      expect(await accountExists(account.id)).toBe(true)
    })

    it(`requires a fresh session for ${format} requests`, async () => {
      const user = await createUser()
      const account = await linkAccount(user.id)
      await pool.query("UPDATE session SET created_at = now() - interval '2 days' WHERE user_id = $1", [user.id])
      const response = await unlink(user.cookie, requestBody(account))
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' })
      expect(await accountExists(account.id)).toBe(true)
    })

    it(`rejects untrusted origins for ${format} requests`, async () => {
      const user = await createUser()
      const account = await linkAccount(user.id)
      const response = await unlink(user.cookie, requestBody(account), 'https://untrusted.example.invalid')
      expect(response.status).toBe(403)
      expect(await accountExists(account.id)).toBe(true)
    })
  }
})