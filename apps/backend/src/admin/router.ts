import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER, adminContract } from '@gekichumai/admin-contract'
import { implement } from '@orpc/server'
import type { auth } from '../auth.js'
import { config } from '../config.js'
import { resolveAdministratorPrincipal, type AdministratorPrincipal, type RoleBearingUser } from './role-policy.js'

export type AdminRequestContext = {
  user?: typeof auth.$Infer.Session.user
  authorizationUser?: RoleBearingUser
  requestId?: string
}

export type AuthorizeAdminRequest = (context: AdminRequestContext) => boolean | Promise<boolean>
export type ResolveAdminRequestPrincipal = (
  context: AdminRequestContext,
) => AdministratorPrincipal | undefined | Promise<AdministratorPrincipal | undefined>

const resolveConfiguredPrincipal: ResolveAdminRequestPrincipal = (context) =>
  resolveAdministratorPrincipal(context.authorizationUser, config.auth.superAdministrators)

export const createAdminRouter = (
  authorize: AuthorizeAdminRequest = () => false,
  resolvePrincipal: ResolveAdminRequestPrincipal = resolveConfiguredPrincipal,
) => {
  const os = implement(adminContract).$context<AdminRequestContext>()
  const authorized = os.use(async ({ context, next, errors }) => {
    if (!(await authorize(context))) throw errors.UNAUTHORIZED()
    return next()
  })

  return authorized.router({
    bootstrap: os.bootstrap.handler(async ({ input, errors, context }) => {
      const received = input.headers[ADMIN_CONTRACT_HEADER]
      if (received !== ADMIN_CONTRACT_COMPATIBILITY_ID) {
        throw errors.ADMIN_CLIENT_INCOMPATIBLE({
          data: {
            expected: ADMIN_CONTRACT_COMPATIBILITY_ID,
            received: received ?? null,
          },
        })
      }

      const principal = await resolvePrincipal(context)
      if (!principal) throw errors.UNAUTHORIZED()

      return {
        contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
        ready: true as const,
        principal,
      }
    }),
  })
}

// The production router remains fail closed until the centralized HTTP role
// guard loads the authenticated session and authorizes this factory.
export const adminRouter = createAdminRouter()