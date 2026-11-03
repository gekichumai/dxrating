import { getOpenAPIMeta } from '@orpc/openapi'

/**
 * Whether a procedure belongs in the public OpenAPI document (`/spec.json`): every route tagged `internal`, such as
 * the cloud save routes, stays out.
 */
export const isPublicSpecProcedure = (contract: Parameters<typeof getOpenAPIMeta>[0]): boolean =>
  !getOpenAPIMeta(contract)?.tags?.includes('internal')