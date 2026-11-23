import type { DBFieldAttribute, GenericEndpointContext } from 'better-auth'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import type { Database } from '../db/index'
import { EMAIL_VERIFICATION_METHODS, type EmailVerificationMethod, user as userTable } from '../db/auth-schema'

/**
 * Keeps `user.email_verified_at` and `user.email_verification_method` in step with `user.email_verified`
 * (gekichumai/meta#80): when and how the current address was first verified, and nothing while it is unverified.
 *
 * Better Auth writes `email_verified` itself, so its database hooks record the rest:
 *
 * - creating a verified user (an OAuth sign-up whose provider vouches for the address) records it straight away;
 * - an update that unverifies the address (`emailVerified: false`) clears both columns;
 * - an update that writes `email` is a new address, so it forgets the old record: it starts a new one at once when the
 *   same write says the address is verified (Better Auth's change-email confirmation keeps `emailVerified: true`), and
 *   clears it otherwise. The hook cannot see the old address, so a write that repeats the current one starts over too;
 * - any other update that verifies the address (an OAuth sign-in that promotes it, a verification link) is recorded after
 *   the write by {@link recordEmailVerification}, because Better Auth's update hook sees only the new values, not the row.
 *   That follow-up only fills an empty record on a row that is still verified, so it neither moves the first time nor
 *   re-verifies an address a later write unverified.
 *
 * Code outside Better Auth that proves control of an address (the Email Verification Protocol, a mailed link it sends
 * itself) calls {@link markEmailVerified} with the proven address and its method.
 */

export { EMAIL_VERIFICATION_METHODS, type EmailVerificationMethod }

/** `user.additionalFields`: readable on the session user, never settable by a client (`input: false`) */
export const emailVerificationUserFields = {
  emailVerifiedAt: { type: 'date', required: false, input: false },
  emailVerificationMethod: {
    type: [...EMAIL_VERIFICATION_METHODS] as EmailVerificationMethod[],
    required: false,
    input: false,
  },
} satisfies Record<string, DBFieldAttribute>

/** Better Auth routes (paths below `/api/auth`) whose writes of `emailVerified: true` come from an OAuth provider */
const OAUTH_PATH_PREFIXES = ['/callback/', '/oauth2/callback/', '/sign-in/social', '/one-tap/callback', '/link-social']

/** The method a Better Auth route verifies addresses by; `unknown` for a route that has none on record */
export const verificationMethodForPath = (path: string | undefined): EmailVerificationMethod => {
  if (!path) return 'unknown'
  if (OAUTH_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))) return 'oauth'
  if (path === '/verify-email') return 'email_link'
  return 'unknown'
}

type UserWrite = {
  readonly email?: string | null | undefined
  readonly emailVerified?: boolean | null | undefined
  readonly emailVerifiedAt?: unknown
  readonly emailVerificationMethod?: unknown
}

const isMethod = (value: unknown): value is EmailVerificationMethod =>
  typeof value === 'string' && (EMAIL_VERIFICATION_METHODS as readonly string[]).includes(value)

/** `databaseHooks.user.create.before`: a new user starts with a complete record, or none */
export const recordVerificationOnCreate = (user: UserWrite, path: string | undefined) => {
  if (!user.emailVerified) return { emailVerifiedAt: null, emailVerificationMethod: null }
  return {
    emailVerifiedAt: user.emailVerifiedAt instanceof Date ? user.emailVerifiedAt : new Date(),
    emailVerificationMethod: isMethod(user.emailVerificationMethod)
      ? user.emailVerificationMethod
      : verificationMethodForPath(path),
  }
}

/**
 * `databaseHooks.user.update.before`: unverifying an address, or replacing it, forgets when and how it was verified; a
 * replacement the same write calls verified is recorded now, by the route's method
 */
export const recordVerificationOnUpdate = (update: UserWrite, path: string | undefined) => {
  if (update.emailVerified === false) return { emailVerifiedAt: null, emailVerificationMethod: null }
  if (update.email === undefined) return undefined
  return update.emailVerified === true
    ? { emailVerifiedAt: new Date(), emailVerificationMethod: verificationMethodForPath(path) }
    : { emailVerifiedAt: null, emailVerificationMethod: null }
}

/** `databaseHooks.user.update.after`: whether a written row is verified with nothing recorded yet */
export const needsVerificationRecord = (user: UserWrite | null | undefined): boolean =>
  !!user?.emailVerified && user.emailVerifiedAt == null

/**
 * Fills in the record of an address Better Auth has already marked verified: now, by `method`. It never sets
 * `email_verified` itself, so a hook that runs after a later write unverified the address changes nothing. Returns
 * whether anything changed.
 */
export const recordEmailVerification = Effect.fn('recordEmailVerification')(function* (
  database: typeof Database.Service,
  userId: string,
  method: EmailVerificationMethod,
) {
  const rows = yield* database.query('Record email verification', (db) =>
    db
      .update(userTable)
      .set({ emailVerifiedAt: sql`now()`, emailVerificationMethod: method })
      .where(and(eq(userTable.id, userId), eq(userTable.emailVerified, true), isNull(userTable.emailVerifiedAt)))
      .returning({ id: userTable.id }),
  )
  return rows.length > 0
})

/**
 * What {@link markEmailVerified} did: `verified` (now recorded by the given method), `already_verified` (an earlier
 * verification is kept), or `email_mismatch` (the user's current address is not the proven one, or there is no such
 * user; nothing was verified)
 */
export type MarkEmailVerifiedResult = 'verified' | 'already_verified' | 'email_mismatch'

/**
 * Marks a user's address verified now by `method`, for code that holds its own proof of control of `provenEmail`. Only
 * the address that was proven is verified: if the user's current address differs (case aside), nothing changes. An
 * address that already has a verification time keeps it; the first verification is the one kept.
 *
 * It writes the row directly, not through Better Auth: a cached session (cookie cache) shows the change once it is
 * refreshed.
 */
export const markEmailVerified = Effect.fn('markEmailVerified')(function* (
  database: typeof Database.Service,
  userId: string,
  provenEmail: string,
  method: EmailVerificationMethod,
) {
  const sameAddress = eq(sql`lower(${userTable.email})`, provenEmail.toLowerCase())
  const rows = yield* database.query('Mark email verified', (db) =>
    db
      .update(userTable)
      .set({ emailVerified: true, emailVerifiedAt: sql`now()`, emailVerificationMethod: method })
      .where(and(eq(userTable.id, userId), sameAddress, isNull(userTable.emailVerifiedAt)))
      .returning({ id: userTable.id }),
  )
  if (rows.length > 0) return 'verified' satisfies MarkEmailVerifiedResult
  const current = yield* database.query('Read email verification', (db) =>
    db
      .select({ id: userTable.id })
      .from(userTable)
      .where(and(eq(userTable.id, userId), sameAddress))
      .limit(1),
  )
  const result: MarkEmailVerifiedResult = current.length > 0 ? 'already_verified' : 'email_mismatch'
  return result
})

/** `databaseHooks.user` for Better Auth */
export const emailVerificationHooks = (database: typeof Database.Service) => ({
  create: {
    before: async (user: UserWrite, context: GenericEndpointContext | null) => ({
      data: recordVerificationOnCreate(user, context?.path),
    }),
  },
  update: {
    before: async (update: UserWrite, context: GenericEndpointContext | null) => {
      const data = recordVerificationOnUpdate(update, context?.path)
      return data ? { data } : undefined
    },
    after: async (user: (UserWrite & { readonly id: string }) | null, context: GenericEndpointContext | null) => {
      if (!user || !needsVerificationRecord(user)) return
      // The address is verified either way; a failed record must not fail the sign-in that verified it
      // oxlint-disable-next-line no-restricted-properties -- Better Auth awaits this inside Authentication.handle, which runApp joins uninterruptibly
      await Effect.runPromise(
        recordEmailVerification(database, user.id, verificationMethodForPath(context?.path)).pipe(
          Effect.catch((error) => Effect.logWarning('Could not record the email verification', error)),
        ),
      )
    },
  },
})