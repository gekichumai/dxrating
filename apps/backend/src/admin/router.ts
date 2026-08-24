import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER, adminContract } from '@gekichumai/admin-contract'
import { implement, isDefinedError, ORPCError } from '@orpc/server'
import {
  AdminAuthorizationFailure,
  requireAdmin,
  requireAdminProcedurePolicy,
  requireAuthenticated,
  requireFreshLogin,
  requireRecentPrimaryAuth,
  requireSuperAdmin,
  requireTargetAuthorization,
  type AdminMutationAuthorizationTransaction,
  type AdminTargetAuthorization,
  type AuthorizedAdminRequest,
} from './authorization.js'
import type { AdminRequestAuthentication, AuthenticatedAdminRequest } from './principal-loader.js'
import type { AdministratorPrincipal, AdministratorTargetAction } from './role-policy.js'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import { AdminPrimaryAuthFailure, type AdminPrimaryAuthActor, type AdminPrimaryAuthService } from './primary-auth.js'
import { adminPrimaryAuthService } from './primary-auth-runtime.js'
import {
  sanitizeAdminAuthorizationResult,
  sanitizeAdminCorrelationId,
  type AdminAuthorizationResult,
} from './observability.js'

export type AdminRequestContext = {
  readonly authentication?: AdminRequestAuthentication
  readonly requestId?: string
  readonly requestOrigin?: string
  readonly recordAuthorizationResult?: (procedureName: string, result: AdminAuthorizationResult) => void | Promise<void>
}

type AuthenticatedAdminContext = {
  readonly adminAuthentication: AuthenticatedAdminRequest
}

type AuthorizedAdminContext = {
  readonly adminAuthentication: AuthorizedAdminRequest
  readonly adminPrincipal: AdministratorPrincipal
}

const os = implement(adminContract).$context<AdminRequestContext>()

const requestErrorData = (context: AdminRequestContext) => ({
  requestId: sanitizeAdminCorrelationId(context.requestId) ?? null,
})

const recordAuthorizationResult = async (context: AdminRequestContext, procedureName: string, result: string) => {
  try {
    await context.recordAuthorizationResult?.(procedureName, sanitizeAdminAuthorizationResult(result))
  } catch {
    // Authorization and response delivery never depend on telemetry availability.
  }
}

const authorizationOutcomeMiddleware = os.middleware(async ({ context, next, path }) => {
  const procedureName = path.join('.')

  try {
    const result = await next()
    await recordAuthorizationResult(context, procedureName, 'SUCCESS')
    return result
  } catch (error) {
    await recordAuthorizationResult(
      context,
      procedureName,
      error instanceof ORPCError ? error.code : 'INTERNAL_SERVER_ERROR',
    )
    throw error
  }
})

export const adminErrorBoundaryMiddleware = os.middleware(async ({ context, errors, next }) => {
  try {
    return await next()
  } catch (error) {
    const data = requestErrorData(context)

    if (isDefinedError(error)) throw error

    if (error instanceof AdminAuthorizationFailure) {
      switch (error.code) {
        case 'UNAUTHENTICATED':
          throw errors.UNAUTHENTICATED({ data })
        case 'FORBIDDEN':
          throw errors.FORBIDDEN({ data })
        case 'RECENT_AUTH_REQUIRED':
          throw errors.RECENT_AUTH_REQUIRED({ data })
        case 'FRESH_LOGIN_REQUIRED':
          throw errors.FRESH_LOGIN_REQUIRED({ data })
        case 'NOT_FOUND':
          throw errors.NOT_FOUND({ data })
      }
    }

    if (error instanceof AdminPrimaryAuthFailure) {
      if (error.code === 'RATE_LIMITED') throw errors.STEP_UP_RATE_LIMITED({ data })
      throw errors.STEP_UP_FAILED({ data })
    }

    if (error instanceof ORPCError && error.status === 400) throw errors.VALIDATION_FAILED({ data })

    throw errors.INTERNAL_SERVER_ERROR({ data })
  }
})

export const requireAuthenticatedAdminMiddleware = os.middleware<AuthenticatedAdminContext, unknown>(
  async ({ context, next }) => {
    const authentication = requireAuthenticated(context)
    return next({ context: { adminAuthentication: authentication } })
  },
)

export const requireAdminMiddleware = os.middleware<AuthorizedAdminContext, unknown>(async ({ context, next }) => {
  const authentication = requireAdmin(context)
  return next({
    context: {
      adminAuthentication: authentication,
      adminPrincipal: authentication.principal,
    },
  })
})

export const requireAdminProcedurePolicyMiddleware = os.middleware<AuthorizedAdminContext, unknown>(
  async ({ context, next, procedure }) => {
    const policy = procedure['~orpc'].meta.authorization
    const authentication = requireAdminProcedurePolicy(context, policy)

    return next({
      context: {
        adminAuthentication: authentication,
        adminPrincipal: authentication.principal,
      },
    })
  },
)

export const requireSuperAdminMiddleware = os.middleware<AuthorizedAdminContext, unknown>(async ({ context, next }) => {
  const authentication = requireSuperAdmin(context)
  return next({
    context: {
      adminAuthentication: authentication,
      adminPrincipal: authentication.principal,
    },
  })
})

export const requireRecentPrimaryAuthMiddleware = os.middleware<AuthorizedAdminContext, unknown>(
  async ({ context, next }) => {
    const authentication = requireRecentPrimaryAuth(context)
    return next({
      context: {
        adminAuthentication: authentication,
        adminPrincipal: authentication.principal,
      },
    })
  },
)

export const requireFreshLoginMiddleware = os.middleware<AuthorizedAdminContext, unknown>(async ({ context, next }) => {
  const authentication = requireFreshLogin(context)
  return next({
    context: {
      adminAuthentication: authentication,
      adminPrincipal: authentication.principal,
    },
  })
})

export type AdminMutationAuthorizationTransactionRunner = <Result>(
  operation: (transaction: AdminMutationAuthorizationTransaction) => Promise<Result>,
) => Promise<Result>

export const createAdminTargetAuthorizationMiddleware = <Input>({
  action,
  getTargetUserId,
  runInTransaction,
  superAdministrators,
}: {
  action: AdministratorTargetAction
  getTargetUserId: (input: Input) => string
  runInTransaction: AdminMutationAuthorizationTransactionRunner
  superAdministrators: SuperAdministratorAllowlist
}) =>
  os.middleware<
    {
      readonly adminTargetAuthorization: AdminTargetAuthorization
      readonly adminMutationAuthorizationTransaction: AdminMutationAuthorizationTransaction
    },
    Input
  >(async ({ context, next, procedure }, input) =>
    runInTransaction(async (transaction) => {
      if (procedure['~orpc'].meta.authorization.targetAction !== action) {
        throw new Error('Administrator target authorization policy mismatch')
      }

      const targetAuthorization = await requireTargetAuthorization({
        context,
        targetUserId: getTargetUserId(input),
        action,
        transaction,
        superAdministrators,
      })
      return next({
        context: {
          adminTargetAuthorization: targetAuthorization,
          adminMutationAuthorizationTransaction: transaction,
        },
      })
    }),
  )

const primaryAuthActorFromContext = (context: AuthorizedAdminContext): AdminPrimaryAuthActor => ({
  userId: context.adminAuthentication.authorizationUser.id,
  sessionId: context.adminAuthentication.session.id,
  allowlistedSuperAdministrator: context.adminPrincipal.effectiveRole === 'super_admin',
})

export const createAdminRouter = ({
  primaryAuth = adminPrimaryAuthService,
}: {
  primaryAuth?: AdminPrimaryAuthService
} = {}) => {
  const authorized = os
    .use(authorizationOutcomeMiddleware)
    .use(adminErrorBoundaryMiddleware)
    .use(requireAdminProcedurePolicyMiddleware)

  return authorized.router({
    bootstrap: authorized.bootstrap.handler(async ({ input, errors, context }) => {
      const received = input.headers[ADMIN_CONTRACT_HEADER]
      if (received !== ADMIN_CONTRACT_COMPATIBILITY_ID) {
        throw errors.ADMIN_CLIENT_INCOMPATIBLE({
          data: {
            ...requestErrorData(context),
            expected: ADMIN_CONTRACT_COMPATIBILITY_ID,
            received: received ?? null,
          },
        })
      }

      return {
        contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
        ready: true as const,
        principal: context.adminPrincipal,
      }
    }),
    primaryAuthStatus: authorized.primaryAuthStatus.handler(async ({ context }) =>
      primaryAuth.getStatus(primaryAuthActorFromContext(context)),
    ),
    completePrimaryAuthPassword: authorized.completePrimaryAuthPassword.handler(async ({ input, context }) =>
      primaryAuth.completePassword(primaryAuthActorFromContext(context), input.body.password),
    ),
    initiatePrimaryAuthOauth: authorized.initiatePrimaryAuthOauth.handler(async ({ input, context }) =>
      primaryAuth.initiateOauth(primaryAuthActorFromContext(context), input.body.provider, context.requestOrigin),
    ),
  })
}

export const adminRouter = createAdminRouter()