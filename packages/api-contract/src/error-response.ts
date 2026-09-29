import { createORPCErrorFromJson, isORPCErrorJson } from '@orpc/client'

/** Accept error bodies that retain the status field for deployed oRPC v1 clients. */
export function decodeLegacyErrorResponse(body: unknown) {
  if (typeof body !== 'object' || body === null || !('status' in body)) return undefined

  const { status, ...error } = body
  if (typeof status !== 'number' || !isORPCErrorJson(error)) return undefined

  return createORPCErrorFromJson(error)
}