import { oc as contractBuilder } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { z } from 'zod'

const oc = contractBuilder.errors({})

/**
 * The admin API contract (gekichumai/meta#50, Revision 2). It is served only by apps/admin-api at
 * admin.dxrating.net/api, behind Cloudflare Access, and its OpenAPI document is private to that host.
 */
export const PrincipalSchema = z.object({
  type: z.enum(['human', 'agent']),
  id: z.string(),
  /** `type:id`, the form written to `created_by` / `updated_by` and the audit log */
  actor: z.string(),
  scopes: z.array(z.string()),
})

export const adminApiContract = {
  me: oc
    .meta(openapi({ method: 'GET', path: '/me', summary: 'The calling principal', tags: ['admin'] }))
    .output(PrincipalSchema),
}