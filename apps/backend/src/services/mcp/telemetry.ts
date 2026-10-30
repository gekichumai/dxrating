import { Context, Effect, Layer, Schedule } from 'effect'
import { Sentry } from '../../lib/functions/sentry'
import { MCP_MAX_BODY_BYTES } from './http'
import { MCP_TOOL_NAMES } from './server'

/**
 * Telemetry of the MCP endpoint, observed around the handler without changing what it answers.
 *
 * Each request adds MCP fields to the request's evlog wide event, named after the OpenTelemetry MCP semantic
 * conventions (mcp.method.name, gen_ai.tool.name, jsonrpc.request.id, mcp.protocol.version, ...), and adds one count
 * to an in-process rollup flushed to Sentry metrics once a minute with bounded labels only.
 *
 * Deliberately absent: addresses (or any hash or prefix of them), location, tool arguments and search text, tool
 * results, headers other than the protocol version and a client class derived from the User-Agent.
 */

export const MCP_USAGE_FLUSH_INTERVAL = '1 minute'

const KNOWN_METHODS = new Set([
  'initialize',
  'ping',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/templates/list',
  'resources/read',
  'prompts/list',
  'prompts/get',
  'completion/complete',
  'logging/setLevel',
  'notifications/initialized',
  'notifications/cancelled',
  'notifications/progress',
  'notifications/roots/list_changed',
])

const MAX_BATCH_FIELDS = 20
const MAX_CLIENT_BYTES = 128
const MAX_ERROR_BYTES = 256

export type McpOutcome = 'ok' | 'tool_error' | 'rpc_error' | 'rate_limited'
export type McpClientClass =
  | 'claude'
  | 'chatgpt'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'gemini'
  | 'cline'
  | 'inspector'
  | 'other'
  | 'none'

/** Cuts a string to at most `bytes` UTF-8 bytes without splitting a character */
export function truncateBytes(value: string, bytes: number): string {
  const encoded = new TextEncoder().encode(value)
  if (encoded.length <= bytes) return value
  return new TextDecoder().decode(encoded.slice(0, bytes)).replace(/�$/, '')
}

const boundedMethod = (method: unknown) =>
  typeof method === 'string' && KNOWN_METHODS.has(method) ? method : method === undefined ? 'none' : 'other'

export const boundedToolName = (name: unknown) =>
  typeof name === 'string' && MCP_TOOL_NAMES.includes(name) ? name : 'other'

const CLIENT_PATTERNS: readonly [McpClientClass, RegExp][] = [
  ['claude', /claude|anthropic/i],
  ['chatgpt', /chatgpt|openai/i],
  ['cursor', /cursor/i],
  ['vscode', /visual studio code|vscode|vs code|copilot/i],
  ['windsurf', /windsurf|codeium/i],
  ['gemini', /gemini/i],
  ['cline', /cline|roo/i],
  ['inspector', /inspector/i],
]

export function classifyMcpClient(clientName: string | undefined, userAgent: string | undefined): McpClientClass {
  for (const value of [clientName, userAgent]) {
    if (!value) continue
    const match = CLIENT_PATTERNS.find(([, pattern]) => pattern.test(value))
    if (match) return match[0]
  }
  return clientName || userAgent ? 'other' : 'none'
}

type JsonObject = Record<string, unknown>
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null

const requestId = (id: unknown) =>
  typeof id === 'number' ? id : typeof id === 'string' ? truncateBytes(id, 64) : undefined

const PROTOCOL_VERSION = /^\d{4}-\d{2}-\d{2}$/
const protocolVersion = (value: unknown) =>
  typeof value === 'string' ? (PROTOCOL_VERSION.test(value) ? value : 'invalid') : undefined

/** The clientInfo of an initialize, else the client reported in params._meta */
function clientInfo(params: JsonObject | undefined): { name?: string; version?: string } {
  const candidates = [params?.clientInfo, isObject(params?._meta) ? params._meta.clientInfo : undefined]
  for (const info of candidates) {
    if (isObject(info) && typeof info.name === 'string') {
      return {
        name: truncateBytes(info.name, MAX_CLIENT_BYTES),
        version: typeof info.version === 'string' ? truncateBytes(info.version, MAX_CLIENT_BYTES) : undefined,
      }
    }
  }
  return {}
}

/** The number of items of a result: the tools of a list, else the first array of a tool's structured content */
function resultCount(method: string, result: JsonObject): number | undefined {
  if (method === 'tools/list' && Array.isArray(result.tools)) return result.tools.length
  if (method === 'tools/call' && isObject(result.structuredContent)) {
    const list = Object.values(result.structuredContent).find(Array.isArray)
    return list ? list.length : undefined
  }
  return undefined
}

export interface McpRequestTelemetry {
  /** Nested fields for the wide event; evlog flattens them to dotted names */
  readonly event: JsonObject
  /** Labels of the rollup: each from a bounded set */
  readonly method: string
  readonly tool: string
  readonly outcome: McpOutcome
  readonly clientClass: McpClientClass
  readonly durationMs: number
}

/**
 * Describes one MCP exchange from the request body and the response. Only fields named in the module comment are
 * read: tool arguments are never touched, and error messages of a tool call are left out as they may quote them.
 */
export function describeMcpExchange(input: {
  readonly headers: Headers
  readonly requestBody: unknown
  readonly status: number
  readonly responseBody: unknown
  readonly responseBytes: number | undefined
  readonly durationMs: number
}): McpRequestTelemetry {
  const messages = (Array.isArray(input.requestBody) ? input.requestBody : [input.requestBody]).filter(isObject)
  const batch = Array.isArray(input.requestBody)
  const methods = messages.map((m) => boundedMethod(m.method))
  const tools = messages
    .filter((m) => m.method === 'tools/call')
    .map((m) => boundedToolName(isObject(m.params) ? m.params.name : undefined))
  const firstParams = messages.map((m) => (isObject(m.params) ? m.params : undefined))
  const init = messages.find((m) => m.method === 'initialize')
  const client = firstParams.map(clientInfo).find((c) => c.name) ?? {}
  const version =
    protocolVersion(input.headers.get('mcp-protocol-version') ?? undefined) ??
    protocolVersion(isObject(init?.params) ? init.params.protocolVersion : undefined)

  const responses = (Array.isArray(input.responseBody) ? input.responseBody : [input.responseBody]).filter(isObject)
  const methodOfId = new Map(messages.map((m) => [m.id, typeof m.method === 'string' ? m.method : '']))
  let outcome: McpOutcome = 'ok'
  let errorCode: number | undefined
  let errorMessage: string | undefined
  let count: number | undefined
  for (const response of responses) {
    const method = methodOfId.get(response.id) ?? (messages.length === 1 ? String(messages[0]?.method ?? '') : '')
    if (isObject(response.error)) {
      outcome = 'rpc_error'
      if (typeof response.error.code === 'number') errorCode ??= response.error.code
      if (method !== 'tools/call' && typeof response.error.message === 'string') {
        errorMessage ??= truncateBytes(response.error.message, MAX_ERROR_BYTES)
      }
    } else if (isObject(response.result)) {
      if (response.result.isError === true && outcome === 'ok') outcome = 'tool_error'
      const n = resultCount(method, response.result)
      if (n !== undefined) count = (count ?? 0) + n
    }
  }
  if (input.status >= 400 && outcome === 'ok') outcome = 'rpc_error'

  const method = batch ? 'batch' : (methods[0] ?? 'none')
  const tool = tools.length === 1 && !batch ? tools[0]! : tools.length > 0 ? 'batch' : 'none'
  const clientClass = classifyMcpClient(client.name, input.headers.get('user-agent') ?? undefined)
  const ids = messages.map((m) => requestId(m.id)).filter((id) => id !== undefined)

  const event: JsonObject = {
    mcp: {
      method: { name: batch ? methods.slice(0, MAX_BATCH_FIELDS) : method },
      ...(batch ? { batch_size: messages.length } : {}),
      ...(version ? { protocol: { version } } : {}),
      client: {
        ...(client.name ? { name: client.name } : {}),
        ...(client.version ? { version: client.version } : {}),
        class: clientClass,
      },
      outcome,
      ...(errorCode !== undefined
        ? { error: { code: errorCode, ...(errorMessage ? { message: errorMessage } : {}) } }
        : {}),
      duration_ms: Math.round(input.durationMs),
      ...(input.responseBytes !== undefined
        ? { result: { bytes: input.responseBytes, ...(count !== undefined ? { count } : {}) } }
        : {}),
      rate_limited: false,
    },
    ...(tools.length > 0 ? { gen_ai: { tool: { name: batch ? tools.slice(0, MAX_BATCH_FIELDS) : tools[0] } } } : {}),
    ...(ids.length > 0 ? { jsonrpc: { request: { id: batch ? ids.slice(0, MAX_BATCH_FIELDS) : ids[0] } } } : {}),
  }
  return { event, method, tool, outcome, clientClass, durationMs: input.durationMs }
}

const parseJson = (text: string): unknown => {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

/** The text of a body up to the endpoint's size limit; past it, nothing (the handler refuses such a body anyway) */
async function readCapped(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MCP_MAX_BODY_BYTES) {
        await reader.cancel()
        return ''
      }
      chunks.push(value)
    }
  } catch {
    return ''
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Runs the handler and describes the exchange. The handler gets the original request and its response is returned
 * as it is; the telemetry reads clones of both, and never fails the request.
 */
export async function observeMcpRequest(
  request: Request,
  handle: (request: Request) => Promise<Response>,
): Promise<{ response: Response; telemetry: McpRequestTelemetry | undefined }> {
  const startedAt = performance.now()
  const requestText = request.method === 'POST' && request.body ? readCapped(request.clone().body) : Promise.resolve('')
  const response = await handle(request)
  const durationMs = performance.now() - startedAt
  try {
    const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
    const responseText = isJson ? await response.clone().text() : undefined
    const telemetry = describeMcpExchange({
      headers: request.headers,
      requestBody: parseJson(await requestText),
      status: response.status,
      responseBody: responseText === undefined ? undefined : parseJson(responseText),
      responseBytes: responseText === undefined ? undefined : new TextEncoder().encode(responseText).length,
      durationMs,
    })
    return { response, telemetry }
  } catch {
    return { response, telemetry: undefined }
  }
}

/** The wide-event fields of a request refused by the rate limit, before its body is read */
export function rateLimitedTelemetry(headers: Headers): McpRequestTelemetry {
  const clientClass = classifyMcpClient(undefined, headers.get('user-agent') ?? undefined)
  return {
    event: { mcp: { rate_limited: true, outcome: 'rate_limited', client: { class: clientClass } } },
    method: 'none',
    tool: 'none',
    outcome: 'rate_limited',
    clientClass,
    durationMs: 0,
  }
}

export interface McpUsageBucket {
  readonly method: string
  readonly tool: string
  readonly outcome: McpOutcome
  readonly clientClass: McpClientClass
  readonly count: number
  readonly durationMsSum: number
  readonly durationMsMax: number
}

/** Every label is from a bounded set, so the rollup holds a bounded number of buckets without an overflow bucket */
export function createMcpUsageRollup() {
  let buckets = new Map<string, McpUsageBucket>()
  return {
    record(t: McpRequestTelemetry) {
      const labels = { method: t.method, tool: t.tool, outcome: t.outcome, clientClass: t.clientClass }
      const key = JSON.stringify(labels)
      const previous = buckets.get(key)
      buckets.set(key, {
        ...labels,
        count: (previous?.count ?? 0) + 1,
        durationMsSum: (previous?.durationMsSum ?? 0) + t.durationMs,
        durationMsMax: Math.max(previous?.durationMsMax ?? 0, t.durationMs),
      })
    },
    drain(): McpUsageBucket[] {
      const drained = [...buckets.values()]
      buckets = new Map()
      return drained
    },
  }
}

export function emitMcpUsageBuckets(buckets: readonly McpUsageBucket[]) {
  for (const bucket of buckets) {
    const attributes = {
      method: bucket.method,
      tool: bucket.tool,
      outcome: bucket.outcome,
      client_class: bucket.clientClass,
    }
    Sentry.metrics.count('mcp.requests', bucket.count, { attributes })
    if (bucket.outcome === 'rate_limited') {
      Sentry.metrics.count('mcp.rate_limited', bucket.count, { attributes: { client_class: bucket.clientClass } })
      continue
    }
    const timing = { tool: bucket.tool, method: bucket.method }
    Sentry.metrics.count('mcp.duration_ms_sum', Math.round(bucket.durationMsSum), {
      unit: 'millisecond',
      attributes: timing,
    })
    Sentry.metrics.gauge('mcp.duration_ms_max', Math.round(bucket.durationMsMax), {
      unit: 'millisecond',
      attributes: timing,
    })
  }
}

export class McpUsage extends Context.Service<
  McpUsage,
  { readonly record: (telemetry: McpRequestTelemetry) => Effect.Effect<void> }
>()('dxrating/McpUsage') {}

export const makeMcpUsageLayer = (emit: (buckets: readonly McpUsageBucket[]) => void = emitMcpUsageBuckets) =>
  Layer.effect(
    McpUsage,
    Effect.gen(function* () {
      const rollup = createMcpUsageRollup()
      const flush = Effect.sync(() => {
        const buckets = rollup.drain()
        if (buckets.length > 0) emit(buckets)
      })
      yield* Effect.addFinalizer(() => flush)
      yield* Effect.forkScoped(Effect.repeat(flush, Schedule.spaced(MCP_USAGE_FLUSH_INTERVAL)))
      return { record: (telemetry) => Effect.sync(() => rollup.record(telemetry)) }
    }),
  )

export const McpUsageLive = makeMcpUsageLayer()