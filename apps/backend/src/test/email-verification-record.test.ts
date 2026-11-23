import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { Effect } from 'effect'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// config.ts reads the environment once, at import: turn on a Google provider whose token endpoint the test answers.
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-google-client'
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'
})

import { createAuth } from '../auth'
import { AppConfig } from '../config'
import { Database } from '../db/index'
import {
  emailVerificationHooks,
  markEmailVerified,
  recordEmailVerification,
  recordVerificationOnCreate,
  recordVerificationOnUpdate,
  verificationMethodForPath,
} from '../lib/email-verification-record'
import { appRuntime } from '../runtime'
import { cleanDatabase, extractSessionCookie, getBaseUrl, setupTestServer, signUp, teardownTestServer } from './setup'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const ORIGIN = 'http://localhost:5173'

type VerificationRow = {
  email_verified: boolean
  email_verified_at: Date | null
  email_verification_method: string | null
}

const recordOf = async (email: string) =>
  (
    await pool.query<VerificationRow & { id: string }>(
      'SELECT id, email_verified, email_verified_at, email_verification_method FROM "user" WHERE email = $1',
      [email],
    )
  ).rows[0]

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** Better Auth decodes Google's ID token from the token endpoint's answer without checking its signature */
const googleIdToken = (claims: { sub: string; email: string; email_verified: boolean }) =>
  `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
    iss: 'https://accounts.google.com',
    aud: 'test-google-client',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    name: 'Google Player',
    ...claims,
  })}.signature`

/** Signs in with Google through Better Auth's real redirect and callback, Google's token endpoint answered locally */
const signInWithGoogle = async (claims: { sub: string; email: string; email_verified: boolean }) => {
  const realFetch = globalThis.fetch
  const tokenEndpoint = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Promise.resolve(
        Response.json({
          access_token: 'google-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email profile',
          id_token: googleIdToken(claims),
        }),
      )
    }
    return realFetch(input, init)
  })
  try {
    const start = await realFetch(`${getBaseUrl()}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ provider: 'google', callbackURL: `${ORIGIN}/` }),
    })
    expect(start.status).toBe(200)
    const { url } = (await start.json()) as { url: string }
    const state = new URL(url).searchParams.get('state')!
    const callback = await realFetch(
      `${getBaseUrl()}/api/auth/callback/google?${new URLSearchParams({ code: 'google-code', state })}`,
      { headers: { Cookie: extractSessionCookie(start) }, redirect: 'manual' },
    )
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe(`${ORIGIN}/`)
    expect(tokenEndpoint).toHaveBeenCalled()
  } finally {
    tokenEndpoint.mockRestore()
  }
}

const runWithDatabase = <A, E>(evaluate: (database: typeof Database.Service) => Effect.Effect<A, E>) =>
  appRuntime.runPromise(Effect.flatMap(Database, evaluate))

describe('email verification record helpers', () => {
  it('names the method of the Better Auth route that verified the address', () => {
    expect(verificationMethodForPath('/callback/google')).toBe('oauth')
    expect(verificationMethodForPath('/callback/apple')).toBe('oauth')
    expect(verificationMethodForPath('/sign-in/social')).toBe('oauth')
    expect(verificationMethodForPath('/one-tap/callback')).toBe('oauth')
    expect(verificationMethodForPath('/verify-email')).toBe('email_link')
    expect(verificationMethodForPath('/update-user')).toBe('unknown')
    expect(verificationMethodForPath(undefined)).toBe('unknown')
  })

  it('records a verified new user and leaves an unverified one empty', () => {
    expect(recordVerificationOnCreate({ emailVerified: false }, '/sign-up/email')).toEqual({
      emailVerifiedAt: null,
      emailVerificationMethod: null,
    })
    // A client can't smuggle a record onto an unverified sign-up
    expect(
      recordVerificationOnCreate(
        { emailVerified: false, emailVerifiedAt: new Date(0), emailVerificationMethod: 'admin' },
        '/sign-up/email',
      ),
    ).toEqual({ emailVerifiedAt: null, emailVerificationMethod: null })
    const record = recordVerificationOnCreate({ emailVerified: true }, '/callback/github')
    expect(record.emailVerificationMethod).toBe('oauth')
    expect(record.emailVerifiedAt).toBeInstanceOf(Date)
    const given = new Date('2026-01-01T00:00:00Z')
    expect(
      recordVerificationOnCreate({ emailVerified: true, emailVerifiedAt: given, emailVerificationMethod: 'admin' }, ''),
    ).toEqual({ emailVerifiedAt: given, emailVerificationMethod: 'admin' })
  })

  it('clears the record when an update unverifies the address and leaves other updates alone', async () => {
    expect(recordVerificationOnUpdate({ emailVerified: false }, '/verify-email')).toEqual({
      emailVerifiedAt: null,
      emailVerificationMethod: null,
    })
    expect(recordVerificationOnUpdate({ emailVerified: true }, '/verify-email')).toBeUndefined()
    expect(recordVerificationOnUpdate({}, '/update-user')).toBeUndefined()
    const hooks = emailVerificationHooks({} as typeof Database.Service)
    expect(await hooks.update.before({ emailVerified: false }, null)).toEqual({
      data: { emailVerifiedAt: null, emailVerificationMethod: null },
    })
    expect(await hooks.update.before({ emailVerified: true }, null)).toBeUndefined()
  })

  it('starts a new record when an update replaces the address', () => {
    // Better Auth's change-email confirmation keeps `emailVerified: true` for a user who was verified
    const replaced = recordVerificationOnUpdate({ email: 'new@example.com', emailVerified: true }, '/verify-email')
    expect(replaced?.emailVerificationMethod).toBe('email_link')
    expect(replaced?.emailVerifiedAt).toBeInstanceOf(Date)
    expect(recordVerificationOnUpdate({ email: 'new@example.com' }, '/verify-email')).toEqual({
      emailVerifiedAt: null,
      emailVerificationMethod: null,
    })
    expect(recordVerificationOnUpdate({ email: 'new@example.com', emailVerified: false }, '/verify-email')).toEqual({
      emailVerifiedAt: null,
      emailVerificationMethod: null,
    })
  })
})

describe('email verification records', () => {
  beforeAll(setupTestServer)
  beforeEach(cleanDatabase)
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    await pool.end()
    await teardownTestServer()
  })

  it('leaves an email/password sign-up unverified with nothing recorded, whatever the client sends', async () => {
    const response = await fetch(`${getBaseUrl()}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'mail@example.com',
        password: 'password123',
        name: 'Mail',
        emailVerifiedAt: '2026-01-01T00:00:00Z',
        emailVerificationMethod: 'admin',
      }),
    })
    // Better Auth refuses fields declared `input: false`
    expect(response.status).toBe(400)
    expect(await recordOf('mail@example.com')).toBeUndefined()

    expect((await signUp('mail@example.com', 'password123', 'Mail')).status).toBe(200)
    expect(await recordOf('mail@example.com')).toMatchObject({
      email_verified: false,
      email_verified_at: null,
      email_verification_method: null,
    })
  })

  it('records an OAuth sign-up whose provider vouches for the address', async () => {
    const before = Date.now()
    await signInWithGoogle({ sub: randomUUID(), email: 'google@example.com', email_verified: true })
    const record = await recordOf('google@example.com')
    expect(record).toMatchObject({ email_verified: true, email_verification_method: 'oauth' })
    expect(record!.email_verified_at!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(record!.email_verified_at!.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('leaves an OAuth sign-up unverified when the provider does not vouch for the address', async () => {
    await signInWithGoogle({ sub: randomUUID(), email: 'unvouched@example.com', email_verified: false })
    expect(await recordOf('unvouched@example.com')).toMatchObject({
      email_verified: false,
      email_verified_at: null,
      email_verification_method: null,
    })
  })

  it('records the OAuth sign-in that verifies a linked account, and keeps the first record afterwards', async () => {
    expect((await signUp('linked@example.com', 'password123', 'Linked')).status).toBe(200)
    const { id } = (await recordOf('linked@example.com'))!
    const sub = randomUUID()
    await pool.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, updated_at) VALUES ($1, $2, 'google', $3, now())`,
      [randomUUID(), sub, id],
    )

    await signInWithGoogle({ sub, email: 'linked@example.com', email_verified: true })
    const first = await recordOf('linked@example.com')
    expect(first).toMatchObject({ email_verified: true, email_verification_method: 'oauth' })
    expect(first!.email_verified_at).toBeInstanceOf(Date)

    await signInWithGoogle({ sub, email: 'linked@example.com', email_verified: true })
    expect(await recordOf('linked@example.com')).toEqual(first)
  })

  it('marks an address verified once and keeps the first time and method', async () => {
    expect((await signUp('marked@example.com', 'password123', 'Marked')).status).toBe(200)
    const { id } = (await recordOf('marked@example.com'))!

    expect(
      await runWithDatabase((database) =>
        markEmailVerified(database, id, 'Marked@Example.com', 'email_verification_protocol'),
      ),
    ).toBe('verified')
    const first = await recordOf('marked@example.com')
    expect(first).toMatchObject({ email_verified: true, email_verification_method: 'email_verification_protocol' })
    expect(first!.email_verified_at).toBeInstanceOf(Date)

    expect(
      await runWithDatabase((database) => markEmailVerified(database, id, 'marked@example.com', 'email_link')),
    ).toBe('already_verified')
    expect(await recordOf('marked@example.com')).toEqual(first)
  })

  it('verifies only the address that was proven', async () => {
    expect((await signUp('current@example.com', 'password123', 'Current')).status).toBe(200)
    const { id } = (await recordOf('current@example.com'))!

    expect(
      await runWithDatabase((database) =>
        markEmailVerified(database, id, 'someone-else@example.com', 'email_verification_protocol'),
      ),
    ).toBe('email_mismatch')
    expect(
      await runWithDatabase((database) =>
        markEmailVerified(database, randomUUID(), 'current@example.com', 'email_verification_protocol'),
      ),
    ).toBe('email_mismatch')
    expect(await recordOf('current@example.com')).toMatchObject({
      email_verified: false,
      email_verified_at: null,
      email_verification_method: null,
    })
  })

  it('records a verified address after the write but never re-verifies one a later write unverified', async () => {
    expect((await signUp('late@example.com', 'password123', 'Late')).status).toBe(200)
    const { id } = (await recordOf('late@example.com'))!

    // A pending update.after hook from an earlier verifying write, running after a later write unverified the address
    expect(await runWithDatabase((database) => recordEmailVerification(database, id, 'oauth'))).toBe(false)
    expect(await recordOf('late@example.com')).toMatchObject({
      email_verified: false,
      email_verified_at: null,
      email_verification_method: null,
    })

    await pool.query('UPDATE "user" SET email_verified = true WHERE id = $1', [id])
    expect(await runWithDatabase((database) => recordEmailVerification(database, id, 'oauth'))).toBe(true)
    const first = await recordOf('late@example.com')
    expect(first).toMatchObject({ email_verified: true, email_verification_method: 'oauth' })
    expect(await runWithDatabase((database) => recordEmailVerification(database, id, 'email_link'))).toBe(false)
    expect(await recordOf('late@example.com')).toEqual(first)
  })

  it("gives a replacement address its own record instead of the old address's", async () => {
    await signInWithGoogle({ sub: randomUUID(), email: 'old@example.com', email_verified: true })
    const { id } = (await recordOf('old@example.com'))!
    await pool.query(`UPDATE "user" SET email_verified_at = '2025-01-01T00:00:00Z' WHERE id = $1`, [id])
    const auth = await appRuntime.runPromise(
      Effect.gen(function* () {
        return createAuth(yield* Database, yield* AppConfig)
      }),
    )
    const { internalAdapter } = await auth.$context

    // What Better Auth's change-email confirmation writes for a user who was verified
    const before = Date.now()
    await internalAdapter.updateUser(id, { email: 'new@example.com', emailVerified: true })
    const replaced = await recordOf('new@example.com')
    expect(replaced).toMatchObject({ email_verified: true })
    expect(replaced!.email_verification_method).not.toBe('oauth')
    expect(replaced!.email_verified_at!.getTime()).toBeGreaterThanOrEqual(before - 1000)

    // Replacing it with an address nobody vouched for leaves no record behind
    await internalAdapter.updateUser(id, { email: 'unproven@example.com', emailVerified: false })
    expect(await recordOf('unproven@example.com')).toMatchObject({
      email_verified: false,
      email_verified_at: null,
      email_verification_method: null,
    })
  })

  it('refuses a record without a verified address or a method', async () => {
    expect((await signUp('constraint@example.com', 'password123', 'Constraint')).status).toBe(200)
    await expect(
      pool.query(`UPDATE "user" SET email_verified_at = now(), email_verification_method = 'admin' WHERE email = $1`, [
        'constraint@example.com',
      ]),
    ).rejects.toThrow(/user_email_verification_record_check/)
    await expect(
      pool.query(`UPDATE "user" SET email_verified = true, email_verified_at = now() WHERE email = $1`, [
        'constraint@example.com',
      ]),
    ).rejects.toThrow(/user_email_verification_record_check/)
    await expect(
      pool.query(
        `UPDATE "user" SET email_verified = true, email_verified_at = now(), email_verification_method = 'sms' WHERE email = $1`,
        ['constraint@example.com'],
      ),
    ).rejects.toThrow(/user_email_verification_method_check/)
  })

  it('backfills already-verified users with their creation time, by whether an OAuth account is linked', async () => {
    const backfillFolder = readdirSync(path.resolve(import.meta.dirname, '../../drizzle')).find((folder) =>
      folder.endsWith('_backfill_email_verified_at'),
    )!
    const backfill = readFileSync(
      path.resolve(import.meta.dirname, '../../drizzle', backfillFolder, 'migration.sql'),
      'utf8',
    )
    const createdAt = '2025-03-04 05:06:07'
    const insertUser = (email: string, verified: boolean) =>
      pool
        .query<{ id: string }>(
          `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
           VALUES ($1, $2, $2, $3, $4, now()) RETURNING id`,
          [randomUUID(), email, verified, createdAt],
        )
        .then((result) => result.rows[0]!.id)
    const oauthUser = await insertUser('oauth@example.com', true)
    await pool.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, updated_at) VALUES ($1, $2, 'github', $3, now())`,
      [randomUUID(), randomUUID(), oauthUser],
    )
    const passwordUser = await insertUser('legacy@example.com', true)
    await pool.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, updated_at) VALUES ($1, $1, 'credential', $1, now())`,
      [passwordUser],
    )
    await insertUser('unverified@example.com', false)
    await signInWithGoogle({ sub: randomUUID(), email: 'recorded@example.com', email_verified: true })
    const recorded = await recordOf('recorded@example.com')

    await pool.query(backfill)

    expect(await recordOf('oauth@example.com')).toMatchObject({
      email_verified: true,
      email_verified_at: new Date(`${createdAt}Z`),
      email_verification_method: 'oauth',
    })
    expect(await recordOf('legacy@example.com')).toMatchObject({
      email_verified: true,
      email_verified_at: new Date(`${createdAt}Z`),
      email_verification_method: 'unknown',
    })
    expect(await recordOf('unverified@example.com')).toMatchObject({
      email_verified: false,
      email_verified_at: null,
      email_verification_method: null,
    })
    expect(await recordOf('recorded@example.com')).toEqual(recorded)
  })
})