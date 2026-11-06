import { Sentry } from '../../lib/functions/sentry'
import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server'
import type { McpCatalog } from './catalog'
import { MCP_GUIDE_URL } from './listing'
import { createMcpServer } from './server'

export const MCP_PATH = '/mcp'

/** The body of a request (413 past it): a tool call is a few hundred bytes */
export const MCP_MAX_BODY_BYTES = 64 * 1024

export const MCP_CORS_OPTIONS = {
  // no credentials and no writes: any page may call it, as browser-based MCP clients do
  origin: '*',
  // Mcp-Method and Mcp-Name mirror the method and tool of 2026-07-28 requests, which must carry them
  allowHeaders: [
    'Content-Type',
    'Accept',
    'Mcp-Protocol-Version',
    'Mcp-Method',
    'Mcp-Name',
    'Mcp-Session-Id',
    'Last-Event-ID',
  ],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
  maxAge: 86400,
}

const jsonRpcError = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

/** The MCP server of a request, wrapped for Sentry tracing when there is a Sentry client */
function serverFor(catalog: McpCatalog | undefined) {
  // a span per MCP message with the OpenTelemetry MCP attributes (mcp.method.name, gen_ai.tool.name, ...), the
  // arguments and the results; without a Sentry client (development, tests) the server is left as it is
  return Sentry.getClient()
    ? Sentry.wrapMcpServerWithSentry(createMcpServer(catalog), { recordInputs: true, recordOutputs: true })
    : createMcpServer(catalog)
}

/**
 * Answers an MCP request statelessly, so any replica answers any request. Both protocol eras are served from the same
 * server definition:
 *
 * - 2025-era requests (an `initialize` handshake, then requests with a negotiated MCP-Protocol-Version header) get a
 *   server of their own over a stateless transport with JSON responses: no sessions, no server-sent events.
 * - 2026-07-28 requests, which carry their protocol version, client info and capabilities in `_meta` on every request
 *   and have no handshake, are answered by the SDK's modern handler; a revision it does not serve gets the
 *   specification's UnsupportedProtocolVersionError (-32022) with the supported list, so the client can retry.
 *
 * GET (the stream of server messages of the 2025 revisions) and DELETE (the end of a session) are 405, as the
 * specification has it for a server without them.
 */
export async function handleMcpRequest(request: Request, catalog: McpCatalog | undefined): Promise<Response> {
  // a person who opens the endpoint in a browser is sent to the guide
  if (request.method === 'GET' && request.headers.get('accept')?.includes('text/html')) {
    return new Response(null, { status: 303, headers: { Location: MCP_GUIDE_URL, 'Cache-Control': 'no-store' } })
  }
  if (request.method !== 'POST') {
    return jsonRpcError(405, -32000, 'Method not allowed: this server answers POST only (stateless, no sessions).', {
      Allow: 'POST, OPTIONS',
    })
  }
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MCP_MAX_BODY_BYTES) return jsonRpcError(413, -32600, 'Request body too large')

  const response = (await isLegacyRequest(request, undefined, { maxRequestBodySize: MCP_MAX_BODY_BYTES }))
    ? await handleLegacyRequest(request, catalog)
    : await createMcpHandler(() => serverFor(catalog), {
        legacy: 'reject',
        maxRequestBodySize: MCP_MAX_BODY_BYTES,
      }).fetch(request)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

/** A 2025-era request: initialize or a request after it, answered by a server and transport of its own */
async function handleLegacyRequest(request: Request, catalog: McpCatalog | undefined): Promise<Response> {
  const server = serverFor(catalog)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MCP_MAX_BODY_BYTES,
  })
  try {
    await server.connect(transport)
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
}

/**
 * A fixed-window limit of the requests of each client, in memory: each replica counts its own. The limit is high
 * enough for an assistant answering a question (a handful of calls), and stops a script crawling the catalog, which
 * /api/v1/dxdata serves whole. The limiter is the generic one in `services/rate-limit.ts`.
 */
export { createRateLimiter } from '../rate-limit'

export const MCP_RATE_LIMIT = { limit: 300, windowMs: 60_000 }

export { clientKey } from './client-key'

export function rateLimited(retryAfterSeconds: number): Response {
  return jsonRpcError(429, -32000, `Too many requests. Retry in ${retryAfterSeconds} seconds.`, {
    'Retry-After': String(retryAfterSeconds),
  })
}