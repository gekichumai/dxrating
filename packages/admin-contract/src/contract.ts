import { oc, type InferContractRouterInputs, type InferContractRouterOutputs } from '@orpc/contract'
import { z } from 'zod'

export const ADMIN_CONTRACT_HEADER = 'x-dxrating-admin-contract' as const
export const ADMIN_CLIENT_INCOMPATIBLE_MESSAGE = 'The administrator client and backend contracts do not match' as const

export const ADMIN_ERROR_MESSAGES = {
  UNAUTHENTICATED: 'Administrator authentication is required',
  FORBIDDEN: 'Administrator access is not permitted',
  RECENT_AUTH_REQUIRED: 'Recent primary authentication is required',
  FRESH_LOGIN_REQUIRED: 'A fresh login is required after the authority change',
  STEP_UP_FAILED: 'Primary authentication could not be verified',
  STEP_UP_RATE_LIMITED: 'Primary authentication could not be verified at this time',
  VALIDATION_FAILED: 'The administrator request is invalid',
  NOT_FOUND: 'The requested administrator resource was not found',
  CONFLICT: 'The administrator request conflicts with current state',
  INTERNAL_SERVER_ERROR: 'The administrator request could not be completed',
} as const

export const ADMIN_PRIMARY_AUTH_ACTIONS = [
  'administrator.grant',
  'administrator.revoke',
  'user.ban',
  'user.unban',
  'comment.delete',
  'comment.restore',
  'chart_report.close',
  'chart_report.submit',
  'provenance.read',
  'dashboard.read',
  'raw_artifact.read',
] as const

export type AdminPrimaryAuthAction = (typeof ADMIN_PRIMARY_AUTH_ACTIONS)[number]

export const ADMIN_PRIMARY_AUTH_ACTION_POLICY = {
  'administrator.grant': true,
  'administrator.revoke': true,
  'user.ban': true,
  'user.unban': true,
  'comment.delete': true,
  'comment.restore': false,
  'chart_report.close': false,
  'chart_report.submit': false,
  'provenance.read': false,
  'dashboard.read': false,
  'raw_artifact.read': false,
} as const satisfies Readonly<Record<AdminPrimaryAuthAction, boolean>>

export const adminActionRequiresRecentPrimaryAuth = (action: AdminPrimaryAuthAction): boolean =>
  ADMIN_PRIMARY_AUTH_ACTION_POLICY[action]

export const AdminPrimaryAuthActionSchema = z.enum(ADMIN_PRIMARY_AUTH_ACTIONS)

export const AdminProcedureAuthorizationPolicySchema = z
  .object({
    minimumRole: z.enum(['admin', 'super_admin']),
    recentPrimaryAuth: z.boolean(),
    freshLogin: z.boolean(),
    primaryAuthAction: AdminPrimaryAuthActionSchema.nullable(),
    targetAction: z.enum(['moderate', 'manage_administrator_role']).nullable(),
  })
  .refine((policy) => !(policy.recentPrimaryAuth && policy.freshLogin), {
    message: 'Recent primary authentication and fresh login policies are mutually exclusive',
  })
  .refine(
    (policy) =>
      policy.primaryAuthAction === null
        ? !policy.recentPrimaryAuth
        : policy.recentPrimaryAuth === adminActionRequiresRecentPrimaryAuth(policy.primaryAuthAction),
    { message: 'Recent primary authentication must match the central action policy' },
  )

export type AdminProcedureAuthorizationPolicy = Readonly<z.infer<typeof AdminProcedureAuthorizationPolicySchema>>

export type AdminProcedureMetadata = {
  readonly authorization: AdminProcedureAuthorizationPolicy
}

export const ADMIN_DEFAULT_AUTHORIZATION = {
  minimumRole: 'admin',
  recentPrimaryAuth: false,
  freshLogin: false,
  primaryAuthAction: null,
  targetAction: null,
} as const satisfies AdminProcedureAuthorizationPolicy

export const adminAuthorizationForAction = (
  action: AdminPrimaryAuthAction,
  overrides: Pick<AdminProcedureAuthorizationPolicy, 'minimumRole' | 'targetAction'> = {
    minimumRole: ADMIN_DEFAULT_AUTHORIZATION.minimumRole,
    targetAction: ADMIN_DEFAULT_AUTHORIZATION.targetAction,
  },
): AdminProcedureAuthorizationPolicy => ({
  ...overrides,
  freshLogin: false,
  primaryAuthAction: action,
  recentPrimaryAuth: adminActionRequiresRecentPrimaryAuth(action),
})

export const ADMIN_BOOTSTRAP_AUTHORIZATION = {
  ...ADMIN_DEFAULT_AUTHORIZATION,
} as const satisfies AdminProcedureAuthorizationPolicy

export const AdminContractCompatibilityIdSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const AdminCorrelationIdSchema = z.uuid()

export const AdminErrorDataSchema = z.object({
  requestId: AdminCorrelationIdSchema.nullable(),
})

export const AdminBootstrapInputSchema = z.object({
  headers: z.object({
    [ADMIN_CONTRACT_HEADER]: AdminContractCompatibilityIdSchema.optional(),
  }),
})

export const AdminEffectiveRoleSchema = z.enum(['admin', 'super_admin'])

export const AdminCapabilitiesSchema = z.object({
  canModerateUsers: z.boolean(),
  canModerateAdministrators: z.boolean(),
  canManageAdministrators: z.boolean(),
})

export const AdminPrincipalSchema = z.object({
  userId: z.string().min(1),
  effectiveRole: AdminEffectiveRoleSchema,
  capabilities: AdminCapabilitiesSchema,
})

export const AdminBootstrapOutputSchema = z.object({
  contractCompatibilityId: AdminContractCompatibilityIdSchema,
  ready: z.literal(true),
  principal: AdminPrincipalSchema,
})

export const AdminClientIncompatibleDataSchema = AdminErrorDataSchema.extend({
  expected: AdminContractCompatibilityIdSchema,
  received: AdminContractCompatibilityIdSchema.nullable(),
})

export const adminErrors = {
  ADMIN_CLIENT_INCOMPATIBLE: {
    status: 409,
    message: ADMIN_CLIENT_INCOMPATIBLE_MESSAGE,
    data: AdminClientIncompatibleDataSchema,
  },
  UNAUTHENTICATED: {
    status: 401,
    message: ADMIN_ERROR_MESSAGES.UNAUTHENTICATED,
    data: AdminErrorDataSchema,
  },
  FORBIDDEN: {
    status: 403,
    message: ADMIN_ERROR_MESSAGES.FORBIDDEN,
    data: AdminErrorDataSchema,
  },
  RECENT_AUTH_REQUIRED: {
    status: 401,
    message: ADMIN_ERROR_MESSAGES.RECENT_AUTH_REQUIRED,
    data: AdminErrorDataSchema,
  },
  FRESH_LOGIN_REQUIRED: {
    status: 401,
    message: ADMIN_ERROR_MESSAGES.FRESH_LOGIN_REQUIRED,
    data: AdminErrorDataSchema,
  },
  STEP_UP_FAILED: {
    status: 401,
    message: ADMIN_ERROR_MESSAGES.STEP_UP_FAILED,
    data: AdminErrorDataSchema,
  },
  STEP_UP_RATE_LIMITED: {
    status: 429,
    message: ADMIN_ERROR_MESSAGES.STEP_UP_RATE_LIMITED,
    data: AdminErrorDataSchema,
  },
  VALIDATION_FAILED: {
    status: 400,
    message: ADMIN_ERROR_MESSAGES.VALIDATION_FAILED,
    data: AdminErrorDataSchema,
  },
  NOT_FOUND: {
    status: 404,
    message: ADMIN_ERROR_MESSAGES.NOT_FOUND,
    data: AdminErrorDataSchema,
  },
  CONFLICT: {
    status: 409,
    message: ADMIN_ERROR_MESSAGES.CONFLICT,
    data: AdminErrorDataSchema,
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    message: ADMIN_ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    data: AdminErrorDataSchema,
  },
} as const

const adminProcedure = oc.$meta<AdminProcedureMetadata>({
  authorization: ADMIN_DEFAULT_AUTHORIZATION,
})

export const AdminPrimaryAuthProviderSchema = z.enum(['google'])
export type AdminPrimaryAuthProvider = z.infer<typeof AdminPrimaryAuthProviderSchema>
export const AdminPrimaryAuthWindowOutputSchema = z.object({
  active: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
})
export const AdminPrimaryAuthCompletionOutputSchema = z.object({
  completed: z.literal(true),
  expiresAt: z.iso.datetime(),
})

const AdminContractHeadersSchema = z.object({
  [ADMIN_CONTRACT_HEADER]: AdminContractCompatibilityIdSchema.optional(),
})

export const AdminPrimaryAuthPasswordInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  body: z.object({ password: z.string().min(1).max(1024) }),
})

export const AdminPrimaryAuthOauthInitiateInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  body: z.object({ provider: AdminPrimaryAuthProviderSchema }),
})

export const AdminPrimaryAuthOauthInitiateOutputSchema = z.object({
  authorizationUrl: z.url(),
})

export const adminContract = adminProcedure.errors(adminErrors).router({
  bootstrap: adminProcedure
    .meta({ authorization: ADMIN_BOOTSTRAP_AUTHORIZATION })
    .route({
      method: 'GET',
      path: '/bootstrap',
      operationId: 'getAdminBootstrap',
      summary: 'Validate the private administrator client contract',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminBootstrapInputSchema)
    .output(AdminBootstrapOutputSchema),
  primaryAuthStatus: adminProcedure
    .route({
      method: 'GET',
      path: '/primary-auth/status',
      operationId: 'getAdminPrimaryAuthStatus',
      summary: 'Read the current session primary-authentication window',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminBootstrapInputSchema)
    .output(AdminPrimaryAuthWindowOutputSchema),
  completePrimaryAuthPassword: adminProcedure
    .route({
      method: 'POST',
      path: '/primary-auth/password',
      operationId: 'completeAdminPrimaryAuthPassword',
      summary: 'Complete primary authentication with the current password',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminPrimaryAuthPasswordInputSchema)
    .output(AdminPrimaryAuthCompletionOutputSchema),
  initiatePrimaryAuthOauth: adminProcedure
    .route({
      method: 'POST',
      path: '/primary-auth/oauth/initiate',
      operationId: 'initiateAdminPrimaryAuthOauth',
      summary: 'Initiate provider-bound OAuth primary authentication',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminPrimaryAuthOauthInitiateInputSchema)
    .output(AdminPrimaryAuthOauthInitiateOutputSchema),
})

export type AdminContract = typeof adminContract
export type AdminContractInputs = InferContractRouterInputs<AdminContract>
export type AdminContractOutputs = InferContractRouterOutputs<AdminContract>