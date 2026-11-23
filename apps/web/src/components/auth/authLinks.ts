/**
 * The pages a mailed account link lands on (gekichumai/meta#80). The backend's Better Auth endpoints check the link's
 * token first, then redirect here (apps/backend/src/lib/auth-mail.ts):
 *
 * - /account/verify-email: nothing on success, `?error=TOKEN_EXPIRED` (or another code) on failure. A link works only
 *   in a browser signed in to its account (`?error=SESSION_REQUIRED` otherwise), so success shows on that session;
 * - /account/reset-password: `?token=…` for a token that works, `?error=INVALID_TOKEN` otherwise.
 */

export type ResetLink = { status: 'ready'; token: string } | { status: 'invalid' }

/** A password reset landing: the token to reset with, or nothing usable (an error, a reload after it was stripped) */
export function readResetLink(search: string): ResetLink {
  const params = new URLSearchParams(search)
  const token = params.get('token')
  if (token && !params.has('error')) return { status: 'ready', token }
  return { status: 'invalid' }
}

export type VerifyOutcome =
  | { status: 'verified' }
  | { status: 'pending' }
  | { status: 'unknown' }
  | { status: 'error'; reason: 'expired' | 'signInRequired' | 'invalid' }

/** What the session says, as far as the verification page needs it */
export type VerifySession = { isPending: boolean; emailVerified: boolean | undefined }

/**
 * An email verification landing. Better Auth redirects without a query on success, but a page opened from history or
 * a bookmark has no query either, so success is what the session shows: the link only works signed in to its account.
 * Without a verified session the page has nothing to report (`unknown`).
 */
export function readVerifyOutcome(search: string, session: VerifySession): VerifyOutcome {
  const error = new URLSearchParams(search).get('error')
  if (error !== null) {
    const reason = error === 'TOKEN_EXPIRED' ? 'expired' : error === 'SESSION_REQUIRED' ? 'signInRequired' : 'invalid'
    return { status: 'error', reason }
  }
  if (session.isPending) return { status: 'pending' }
  return session.emailVerified ? { status: 'verified' } : { status: 'unknown' }
}

/** Whether a Better Auth client error carries `code` */
export const hasErrorCode = (error: unknown, code: string) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code