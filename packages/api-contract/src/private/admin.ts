import { oc as contractBuilder } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { z } from 'zod'

const oc = contractBuilder.errors({})

/**
 * Admin contract (gekichumai/meta#50).
 *
 * Every route is tagged `internal`, so it stays out of `/spec.json` and llms.txt. The backend guards every handler
 * with `requireAdmin`: no session is UNAUTHORIZED (401), and a session whose user is not an administrator, or a
 * request from any origin other than the web app's, is FORBIDDEN (403).
 */
export const ADMIN_ROUTE_TAGS = ['internal', 'admin']

export const AdminMeOutputSchema = z.object({ userId: z.string() })

export const adminContract = {
  me: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/admin/me',
        summary: 'The signed-in administrator',
        tags: ADMIN_ROUTE_TAGS,
      }),
    )
    .output(AdminMeOutputSchema),
}