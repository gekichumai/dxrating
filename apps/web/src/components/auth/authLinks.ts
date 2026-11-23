/**
 * The pages a mailed account link lands on (gekichumai/meta#80). The backend's Better Auth endpoints check the link's
 * token first, then redirect here (apps/backend/src/lib/auth-mail.ts):
 *
 * - /account/verify-email: nothing on success, `?error=TOKEN_EXPIRED` (or another code) on failure;
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

export type VerifyOutcome = { status: 'verified' } | { status: 'error'; reason: 'expired' | 'invalid' }

/** An email verification landing: Better Auth redirects without a query on success */
export function readVerifyOutcome(search: string): VerifyOutcome {
  const error = new URLSearchParams(search).get('error')
  if (error === null) return { status: 'verified' }
  return { status: 'error', reason: error === 'TOKEN_EXPIRED' ? 'expired' : 'invalid' }
}

/** Whether a Better Auth client error carries `code` */
export const hasErrorCode = (error: unknown, code: string) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code