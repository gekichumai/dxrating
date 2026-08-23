import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER, adminContract } from '@gekichumai/admin-contract'
import { implement } from '@orpc/server'
import type { auth } from '../auth.js'

export type AdminRequestContext = {
  user?: typeof auth.$Infer.Session.user
  requestId?: string
}

export type AuthorizeAdminRequest = (context: AdminRequestContext) => boolean | Promise<boolean>

export const createAdminRouter = (authorize: AuthorizeAdminRequest = () => false) => {
  const os = implement(adminContract).$context<AdminRequestContext>()
  const authorized = os.use(async ({ context, next, errors }) => {
    if (!(await authorize(context))) throw errors.UNAUTHORIZED()
    return next()
  })

  return authorized.router({
    bootstrap: os.bootstrap.handler(async ({ input, errors }) => {
      const received = input.headers[ADMIN_CONTRACT_HEADER]
      if (received !== ADMIN_CONTRACT_COMPATIBILITY_ID) {
        throw errors.ADMIN_CLIENT_INCOMPATIBLE({
          data: {
            expected: ADMIN_CONTRACT_COMPATIBILITY_ID,
            received: received ?? null,
          },
        })
      }

      return {
        contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
        ready: true as const,
      }
    }),
  })
}

// The production router remains fail closed until the centralized role guard
// introduced by the authorization issue is passed to this factory.
export const adminRouter = createAdminRouter()