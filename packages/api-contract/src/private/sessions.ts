import { oc as contractBuilder } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { z } from 'zod'

const oc = contractBuilder.errors({})

/** Every private route carries `internal`, which keeps it out of the public OpenAPI document. */
const SESSION_TAGS = ['internal', 'account']

/**
 * One of the signed-in user's sessions, as the Security screens list it.
 *
 * Unlike Better Auth's `GET /api/auth/list-sessions`, it has no `token`. The token is the session's bearer credential,
 * which is why Better Auth only lists sessions to a fresh session (one signed in during the last `freshAge`). Without
 * it, the list can be shown to any signed-in session, and a device is revoked by its `id`.
 */
export const DeviceSessionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
})
export type DeviceSession = z.infer<typeof DeviceSessionSchema>

export const DeviceSessionListSchema = z.object({ sessions: z.array(DeviceSessionSchema) })

export const DeviceSessionIdSchema = z.strictObject({ id: z.string().min(1).max(256) })

export const sessionsContract = {
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/me/sessions',
        summary: "List the signed-in user's active sessions, without their tokens",
        tags: SESSION_TAGS,
      }),
    )
    .output(DeviceSessionListSchema),
  revoke: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/me/sessions/{id}/revoke',
        summary: 'Sign out one of the signed-in user’s sessions',
        tags: SESSION_TAGS,
      }),
    )
    .input(DeviceSessionIdSchema)
    .output(z.object({ revoked: z.boolean() })),
}