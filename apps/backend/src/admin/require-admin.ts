import { ORPCError } from '@orpc/server'
import { Effect } from 'effect'
import { AppConfig } from '../config'

/** The administrator a guarded handler acts for; `id` is what it records as the author of a change */
export interface AdminViewer {
  readonly id: string
}

/**
 * The one authorization check of the admin API: every `admin.*` handler starts with it and reads nothing else about
 * who is calling. Today it allows the signed-in users listed in `ADMIN_USER_IDS`; when the admin app adds its own
 * checks (Cloudflare Access, exact Origin) or a roles table replaces the list, only this function changes.
 *
 * No session is UNAUTHORIZED; a session that is not an administrator is FORBIDDEN. An unset list allows nobody.
 */
export const requireAdmin = Effect.fn('Admin.requireAdmin')(function* (context: {
  readonly user?: { readonly id: string } | null
}) {
  const user = context.user
  if (!user) return yield* Effect.fail(new ORPCError('UNAUTHORIZED', { message: 'Sign in to use the admin API' }))
  const { admin } = yield* AppConfig
  if (!admin.userIds.includes(user.id)) {
    return yield* Effect.fail(new ORPCError('FORBIDDEN', { message: 'Not an administrator' }))
  }
  const viewer: AdminViewer = Object.freeze({ id: user.id })
  return viewer
})