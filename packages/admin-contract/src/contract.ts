import { oc, type InferContractRouterInputs, type InferContractRouterOutputs } from '@orpc/contract'
import { z } from 'zod'

export const ADMIN_CONTRACT_HEADER = 'x-dxrating-admin-contract' as const
export const ADMIN_CLIENT_INCOMPATIBLE_MESSAGE = 'The administrator client and backend contracts do not match' as const

export const ADMIN_ERROR_MESSAGES = {
  UNAUTHENTICATED: 'Administrator authentication is required',
  FORBIDDEN: 'Administrator access is not permitted',
  RECENT_AUTH_REQUIRED: 'Recent primary authentication is required',
  FRESH_LOGIN_REQUIRED: 'A fresh login is required after the authority change',
  VALIDATION_FAILED: 'The administrator request is invalid',
  NOT_FOUND: 'The requested administrator resource was not found',
  CONFLICT: 'The administrator request conflicts with current state',
  INTERNAL_SERVER_ERROR: 'The administrator request could not be completed',
} as const

export const AdminProcedureAuthorizationPolicySchema = z
  .object({
    minimumRole: z.enum(['admin', 'super_admin']),
    recentPrimaryAuth: z.boolean(),
    freshLogin: z.boolean(),
    targetAction: z.enum(['moderate', 'manage_administrator_role']).nullable(),
  })
  .refine((policy) => !(policy.recentPrimaryAuth && policy.freshLogin), {
    message: 'Recent primary authentication and fresh login policies are mutually exclusive',
  })

export type AdminProcedureAuthorizationPolicy = Readonly<z.infer<typeof AdminProcedureAuthorizationPolicySchema>>

export type AdminProcedureMetadata = {
  readonly authorization: AdminProcedureAuthorizationPolicy
}

export const ADMIN_DEFAULT_AUTHORIZATION = {
  minimumRole: 'admin',
  recentPrimaryAuth: false,
  freshLogin: false,
  targetAction: null,
} as const satisfies AdminProcedureAuthorizationPolicy

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
})

export type AdminContract = typeof adminContract
export type AdminContractInputs = InferContractRouterInputs<AdminContract>
export type AdminContractOutputs = InferContractRouterOutputs<AdminContract>