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
 * - an update that unverifies the address (`emailVerified: false`, e.g. an email change) clears both columns;
 * - an update that verifies it (an OAuth sign-in that promotes the address, a verification link) is recorded after the
 *   write by {@link markEmailVerified}, because Better Auth's update hook sees only the new values, not the row: the
 *   follow-up only fills an empty timestamp, so a later write of `emailVerified: true` never moves the first one.
 *
 * Code outside Better Auth that verifies an address (the Email Verification Protocol, a mailed link it sends itself)
 * calls {@link markEmailVerified} with its method.
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

/** `databaseHooks.user.update.before`: unverifying an address forgets when and how it was verified */
export const clearVerificationOnUnverify = (update: UserWrite) =>
  update.emailVerified === false ? { emailVerifiedAt: null, emailVerificationMethod: null } : undefined

/** `databaseHooks.user.update.after`: whether a written row is verified with nothing recorded yet */
export const needsVerificationRecord = (user: UserWrite | null | undefined): boolean =>
  !!user?.emailVerified && user.emailVerifiedAt == null

/**
 * Marks a user's address verified now by `method`, unless it already has a verification time; the first verification
 * is the one kept. Returns whether anything changed.
 *
 * It writes the row directly, not through Better Auth: a cached session (cookie cache) shows the change once it is
 * refreshed.
 */
export const markEmailVerified = Effect.fn('markEmailVerified')(function* (
  database: typeof Database.Service,
  userId: string,
  method: EmailVerificationMethod,
) {
  const rows = yield* database.query('Record email verification', (db) =>
    db
      .update(userTable)
      .set({
        emailVerified: true,
        emailVerifiedAt: sql`now()`,
        emailVerificationMethod: method,
      })
      .where(and(eq(userTable.id, userId), isNull(userTable.emailVerifiedAt)))
      .returning({ id: userTable.id }),
  )
  return rows.length > 0
})

/** `databaseHooks.user` for Better Auth */
export const emailVerificationHooks = (database: typeof Database.Service) => ({
  create: {
    before: async (user: UserWrite, context: GenericEndpointContext | null) => ({
      data: recordVerificationOnCreate(user, context?.path),
    }),
  },
  update: {
    before: async (update: UserWrite) => {
      const data = clearVerificationOnUnverify(update)
      return data ? { data } : undefined
    },
    after: async (user: (UserWrite & { readonly id: string }) | null, context: GenericEndpointContext | null) => {
      if (!user || !needsVerificationRecord(user)) return
      // The address is verified either way; a failed record must not fail the sign-in that verified it
      await Effect.runPromise(
        markEmailVerified(database, user.id, verificationMethodForPath(context?.path)).pipe(
          Effect.catch((error) => Effect.logWarning('Could not record the email verification', error)),
        ),
      )
    },
  },
})