import { Sentry } from '../../lib/functions/sentry'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpCatalog } from './catalog'
import { MCP_GUIDE_URL } from './listing'
import { createMcpServer } from './server'

export const MCP_PATH = '/mcp'

/** The body of a request (413 past it): a tool call is a few hundred bytes */
export const MCP_MAX_BODY_BYTES = 64 * 1024

export const MCP_CORS_OPTIONS = {
  // no credentials and no writes: any page may call it, as browser-based MCP clients do
  origin: '*',
  allowHeaders: ['Content-Type', 'Accept', 'Mcp-Protocol-Version', 'Mcp-Session-Id', 'Last-Event-ID'],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
  maxAge: 86400,
}

const jsonRpcError = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

/**
 * Answers an MCP request with a server of its own over a stateless transport with JSON responses: no sessions, no
 * server-sent events, so any replica answers any request. GET (the stream of server messages) and DELETE (the end of
 * a session) are 405, as the specification has it for a server without them.
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

  // a span per MCP message with the OpenTelemetry MCP attributes (mcp.method.name, gen_ai.tool.name, ...), the
  // arguments and the results; without a Sentry client (development, tests) the server is left as it is
  const server = Sentry.getClient()
    ? Sentry.wrapMcpServerWithSentry(createMcpServer(catalog), { recordInputs: true, recordOutputs: true })
    : createMcpServer(catalog)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MCP_MAX_BODY_BYTES,
  })
  try {
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } finally {
    await server.close()
  }
}

/**
 * A fixed-window limit of the requests of each client, in memory: each replica counts its own. The limit is high
 * enough for an assistant answering a question (a handful of calls), and stops a script crawling the catalog, which
 * /api/v1/dxdata serves whole.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const windows = new Map<string, { start: number; count: number }>()
  return {
    /** The seconds to wait before retrying, or 0 when the request is allowed */
    take(key: string, now = Date.now()): number {
      let window = windows.get(key)
      if (!window || now - window.start >= windowMs) {
        // forget the windows that ended, so the map holds the clients of the current window only
        if (windows.size > 10_000) {
          for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k)
        }
        window = { start: now, count: 0 }
        windows.set(key, window)
      }
      window.count += 1
      return window.count > limit ? Math.ceil((window.start + windowMs - now) / 1000) : 0
    },
  }
}

export const MCP_RATE_LIMIT = { limit: 300, windowMs: 60_000 }

export { clientKey } from './client-key'

export function rateLimited(retryAfterSeconds: number): Response {
  return jsonRpcError(429, -32000, `Too many requests. Retry in ${retryAfterSeconds} seconds.`, {
    'Retry-After': String(retryAfterSeconds),
  })
}