import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { Clock, Effect } from 'effect'
import { databaseErrorTags } from '../../db/errors'
import type { Database } from '../../db/index'
import { verification } from '../../db/auth-schema'

/**
 * The per-form nonce of the Email Verification Protocol (WICG report §2.2: "a server-side generated, cryptographically
 * strong random value", unique for each form shown; draft -02 §2.2: at least 128 bits, unique per request, valid for a
 * limited time). The browser binds it into the KB-JWT, so a token works for one form only.
 *
 * Issuing one writes nothing: it is 128 random bits with its expiry, signed (HMAC-SHA-256 with a key derived from
 * `BETTER_AUTH_SECRET`). Anyone can ask for one, so a database row per request would let anyone fill a table. Using it
 * is what writes: {@link consumeNonce} inserts a row keyed by its hash into Better Auth's `verification` table, and the
 * primary key turns a second use into a conflict, atomically, on every instance.
 */

/** How long a form's nonce works; the verifier accepts tokens no older (verifier.ts, MAX_TOKEN_AGE_SECONDS) */
export const NONCE_TTL_SECONDS = 30 * 60
const NONCE_VERSION = 'v1'
/** `verification.identifier` of a used nonce */
export const USED_NONCE_IDENTIFIER = 'email-verification-protocol-nonce'

const signingKey = (secret: string) =>
  createHmac('sha256', secret).update('dxrating email-verification-protocol nonce v1').digest()

const signatureOf = (key: Buffer, payload: string) => createHmac('sha256', key).update(payload).digest('base64url')

/** `v1.<random>.<expiry, seconds, base 36>.<signature>`; URL- and attribute-safe */
export const issueNonce = (secret: string, nowMs: number) => {
  const expiresAt = Math.floor(nowMs / 1000) + NONCE_TTL_SECONDS
  const payload = `${NONCE_VERSION}.${randomBytes(16).toString('base64url')}.${expiresAt.toString(36)}`
  return { nonce: `${payload}.${signatureOf(signingKey(secret), payload)}`, expiresAt: new Date(expiresAt * 1000) }
}

export type NonceCheck = { readonly valid: true; readonly expiresAt: Date } | { readonly valid: false }

/** Whether we issued `nonce` and it hasn't expired; says nothing about whether it was used */
export const checkNonce = (secret: string, nonce: string, nowMs: number): NonceCheck => {
  const parts = nonce.split('.')
  if (parts.length !== 4 || parts[0] !== NONCE_VERSION) return { valid: false }
  const [version, random, expiry, signature] = parts as [string, string, string, string]
  const expected = Buffer.from(signatureOf(signingKey(secret), `${version}.${random}.${expiry}`))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { valid: false }
  const expiresAt = Number.parseInt(expiry, 36)
  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= nowMs) return { valid: false }
  return { valid: true, expiresAt: new Date(expiresAt * 1000) }
}

/**
 * Marks a valid nonce used. Returns `false` when it already was (a replay). Also forgets used nonces that have expired
 * (only sign-ups that carry a token get here, so there are few).
 */
export const consumeNonce = Effect.fn('EmailVerificationProtocol.consumeNonce')(function* (
  database: typeof Database.Service,
  nonce: string,
  expiresAt: Date,
) {
  const id = `evp-nonce:${createHash('sha256').update(nonce).digest('base64url')}`
  const now = new Date(yield* Clock.currentTimeMillis)
  const inserted = yield* database.query('Use an Email Verification Protocol nonce', (db) =>
    db
      .insert(verification)
      .values({ id, identifier: USED_NONCE_IDENTIFIER, value: '1', expiresAt, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: verification.id })
      .returning({ id: verification.id }),
  )
  yield* database
    .query('Forget expired Email Verification Protocol nonces', (db) =>
      db
        .delete(verification)
        .where(and(eq(verification.identifier, USED_NONCE_IDENTIFIER), lt(verification.expiresAt, now))),
    )
    .pipe(Effect.catch((error) => Effect.logWarning('Could not forget expired nonces', databaseErrorTags(error))))
  return inserted.length > 0
})