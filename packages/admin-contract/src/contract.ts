import { oc, type InferContractRouterInputs, type InferContractRouterOutputs } from '@orpc/contract'
import { z } from 'zod'

export const ADMIN_CONTRACT_HEADER = 'x-dxrating-admin-contract' as const
export const ADMIN_CLIENT_INCOMPATIBLE_MESSAGE = 'The administrator client and backend contracts do not match' as const

export const AdminContractCompatibilityIdSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const AdminBootstrapInputSchema = z.object({
  headers: z.object({
    [ADMIN_CONTRACT_HEADER]: AdminContractCompatibilityIdSchema.optional(),
  }),
})

export const AdminBootstrapOutputSchema = z.object({
  contractCompatibilityId: AdminContractCompatibilityIdSchema,
  ready: z.literal(true),
})

export const AdminClientIncompatibleDataSchema = z.object({
  expected: AdminContractCompatibilityIdSchema,
  received: z.string().nullable(),
})

const adminErrors = {
  ADMIN_CLIENT_INCOMPATIBLE: {
    status: 409,
    message: ADMIN_CLIENT_INCOMPATIBLE_MESSAGE,
    data: AdminClientIncompatibleDataSchema,
  },
  UNAUTHORIZED: {
    status: 401,
    message: 'Administrator authentication is required',
  },
} as const

export const adminContract = oc.errors(adminErrors).router({
  bootstrap: oc
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