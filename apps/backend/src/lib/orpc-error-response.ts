import { COMMON_ERROR_STATUS_MAP } from '@orpc/openapi'
import type { ORPCError } from '@orpc/server'

/** An oRPC-shaped error response (with the v1 `status` field) for routes served outside the oRPC handler */
export const orpcErrorResponse = (error: ORPCError<string, unknown>, headers: Record<string, string> = {}) => {
  const status =
    error.code === 'PAYLOAD_TOO_LARGE'
      ? 413
      : (COMMON_ERROR_STATUS_MAP[error.code as keyof typeof COMMON_ERROR_STATUS_MAP] ?? 500)
  return new Response(JSON.stringify({ ...error.toJSON(), status }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}