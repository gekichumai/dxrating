import { SET_PASSWORD_AUTH_PATH } from '@gekichumai/api-contract'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, freshSessionMiddleware } from 'better-auth/api'
import { z } from 'zod'

/**
 * Lets an account without a password (one created with a passkey, or with Google, GitHub or Apple) set its first one,
 * so it can also sign in with its email address and a password. Better Auth's `setPassword` does this but is
 * server-only; this endpoint is the same operation for the signed-in visitor, with the checks a sensitive change needs:
 *
 * - The session must be fresh (`session.freshAge`, 403 `SESSION_NOT_FRESH` otherwise), as for adding a passkey, so an
 *   old session cookie can't give an account a password the attacker knows.
 * - It only ever sets the first password (400 `PASSWORD_ALREADY_SET`); changing one goes through `/change-password`,
 *   which asks for the current password.
 * - The password follows the same length rules as sign-up, and haveIBeenPwned checks it (auth.ts lists this path).
 * - It doesn't ask for a verified email. Nobody can verify one yet (meta#80), and an account made for someone else's
 *   address could as well have signed up with a password from the start; closing that pre-registration takeover is
 *   meta#80's work (verify before an OAuth sign-in links into an unverified account).
 *
 * The write itself is {@link SetPasswordOptions.storeFirstPassword}: Better Auth's adapter runs without transactions
 * here, so its own find-then-link would let two requests at once (two tabs, a double submit) each add a credential
 * account, leaving two passwords and no telling which one sign-in checks.
 */
export interface SetPasswordOptions {
  /**
   * Stores `password` (already hashed) as the user's first password, atomically: it must hold a lock on the user while
   * it checks for an existing password and writes, and answer `false`, writing nothing, when one is already set.
   * `id` is the row ID for a new credential account.
   */
  readonly storeFirstPassword: (input: { userId: string; id: string; password: string }) => Promise<boolean>
}

export const setPassword = ({ storeFirstPassword }: SetPasswordOptions) =>
  ({
    id: 'dxrating-set-password',
    endpoints: {
      setInitialPassword: createAuthEndpoint(
        SET_PASSWORD_AUTH_PATH,
        {
          method: 'POST',
          body: z.object({ newPassword: z.string() }),
          use: [freshSessionMiddleware],
          requireHeaders: true,
        },
        async (ctx) => {
          const { newPassword } = ctx.body
          const userId = ctx.context.session.user.id
          const { minPasswordLength, maxPasswordLength } = ctx.context.password.config
          if (newPassword.length < minPasswordLength) {
            throw APIError.from('BAD_REQUEST', { code: 'PASSWORD_TOO_SHORT', message: 'Password too short' })
          }
          if (newPassword.length > maxPasswordLength) {
            throw APIError.from('BAD_REQUEST', { code: 'PASSWORD_TOO_LONG', message: 'Password too long' })
          }
          const alreadySet = () =>
            APIError.from('BAD_REQUEST', {
              code: 'PASSWORD_ALREADY_SET',
              message: 'User already has a password set',
            })
          // Checked before hashing too, so an account that has a password gets its answer without the slow hash
          const account = await ctx.context.internalAdapter.findCredentialAccount(userId)
          if (account?.password) throw alreadySet()
          // Hashing runs haveIBeenPwned's check, which rejects a known leaked password before anything is written
          const password = await ctx.context.password.hash(newPassword)
          const id = ctx.context.generateId({ model: 'account' }) || crypto.randomUUID()
          if (!(await storeFirstPassword({ userId, id, password }))) throw alreadySet()
          return ctx.json({ status: true })
        },
      ),
    },
  }) satisfies BetterAuthPlugin