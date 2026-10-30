import { MCP_TOOL_NAMES } from './server'
import { describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './catalog'
import { handleMcpRequest } from './http'
import {
  boundedToolName,
  classifyMcpClient,
  createMcpUsageRollup,
  observeMcpRequest,
  rateLimitedTelemetry,
  truncateBytes,
} from './telemetry'
import { publishedCatalog } from './test-fixture'

const catalog = buildMcpCatalog('1', publishedCatalog)

const SECRET_QUERY = 'secret-query-umiyuri'
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://mcp.dxrating.net/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer top-secret-token',
      'CF-Connecting-IP': '203.0.113.77',
      'X-Forwarded-For': '203.0.113.77, 162.158.1.2',
      'User-Agent': 'claude-code/2.1.0',
      ...headers,
    },
    body: JSON.stringify(body),
  })

const observe = async (request: Request) => {
  const { response, telemetry } = await observeMcpRequest(request, (r) => handleMcpRequest(r, catalog))
  if (!telemetry) throw new Error('no telemetry')
  return { response, telemetry, serialized: JSON.stringify(telemetry.event) }
}

const expectNoPrivateData = (serialized: string) => {
  for (const forbidden of ['203.0.113', '162.158', 'top-secret', 'Bearer', SECRET_QUERY, 'umiyuri', 'arguments']) {
    expect(serialized).not.toContain(forbidden)
  }
}

describe('MCP telemetry', () => {
  it('describes an initialize', async () => {
    const { response, telemetry, serialized } = await observe(
      post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'claude-ai', version: '0.1.0' },
        },
      }),
    )
    expect((await response.json()).result.serverInfo.name).toBe('net.dxrating/dxrating')
    expect(telemetry.event).toMatchObject({
      mcp: {
        method: { name: 'initialize' },
        protocol: { version: '2025-06-18' },
        client: { name: 'claude-ai', version: '0.1.0', class: 'claude' },
        outcome: 'ok',
        rate_limited: false,
      },
      jsonrpc: { request: { id: 1 } },
    })
    expect(telemetry.method).toBe('initialize')
    expectNoPrivateData(serialized)
  })

  it('describes a tools/list with its count and size', async () => {
    const { telemetry } = await observe(
      post({ jsonrpc: '2.0', id: 'a', method: 'tools/list' }, { 'Mcp-Protocol-Version': '2025-06-18' }),
    )
    const mcp = telemetry.event.mcp as Record<string, any>
    expect(mcp.method.name).toBe('tools/list')
    expect(mcp.protocol.version).toBe('2025-06-18')
    expect(mcp.result.count).toBe(MCP_TOOL_NAMES.length)
    expect(mcp.result.bytes).toBeGreaterThan(100)
    expect(typeof mcp.duration_ms).toBe('number')
  })

  it('describes a tools/call without its arguments', async () => {
    const { response, telemetry, serialized } = await observe(
      post({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'search_songs', arguments: { query: SECRET_QUERY }, _meta: { progressToken: 1 } },
      }),
    )
    expect(response.status).toBe(200)
    expect(telemetry.event).toMatchObject({ gen_ai: { tool: { name: 'search_songs' } }, mcp: { outcome: 'ok' } })
    expect(telemetry.tool).toBe('search_songs')
    expect(telemetry.clientClass).toBe('claude')
    expectNoPrivateData(serialized)
  })

  it('reports a tool error and folds unknown tool names into other', async () => {
    const { telemetry, serialized } = await observe(
      post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: `x-${SECRET_QUERY}`, arguments: {} } }),
    )
    expect(telemetry.tool).toBe('other')
    expect(['tool_error', 'rpc_error']).toContain(telemetry.outcome)
    expectNoPrivateData(serialized)
  })

  it('reports an RPC error with its code', async () => {
    const { telemetry } = await observe(post({ jsonrpc: '2.0', id: 4, method: 'no/such/method' }))
    expect(telemetry.outcome).toBe('rpc_error')
    expect(telemetry.method).toBe('other')
    const mcp = telemetry.event.mcp as Record<string, any>
    expect(mcp.error.code).toBe(-32601)
    expect(new TextEncoder().encode(mcp.error.message).length).toBeLessThanOrEqual(256)
  })

  it('describes a batch', async () => {
    const { telemetry, serialized } = await observe(
      post([
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'search_songs', arguments: { query: SECRET_QUERY } },
        },
      ]),
    )
    expect(telemetry.method).toBe('batch')
    const event = telemetry.event as Record<string, any>
    expect(event.mcp.batch_size).toBe(2)
    expect(event.mcp.method.name).toEqual(['tools/list', 'tools/call'])
    expect(event.gen_ai.tool.name).toEqual(['search_songs'])
    expectNoPrivateData(serialized)
  })

  it('truncates client names and bounds labels', async () => {
    const long = 'é'.repeat(200)
    const { telemetry } = await observe(
      post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: 'bogus', capabilities: {}, clientInfo: { name: long, version: long } },
      }),
    )
    const mcp = telemetry.event.mcp as Record<string, any>
    expect(new TextEncoder().encode(mcp.client.name).length).toBeLessThanOrEqual(128)
    expect(mcp.protocol.version).toBe('invalid')
    expect(telemetry.clientClass).toBe('claude') // from the User-Agent
    expect(truncateBytes('ab', 1)).toBe('a')
    expect(boundedToolName('a'.repeat(1000))).toBe('other')
    expect(classifyMcpClient('Visual Studio Code', undefined)).toBe('vscode')
    expect(classifyMcpClient('openai-mcp', undefined)).toBe('chatgpt')
    expect(classifyMcpClient('random-thing', undefined)).toBe('other')
    expect(classifyMcpClient(undefined, undefined)).toBe('none')
  })

  it('rolls up with bounded labels only', async () => {
    const rollup = createMcpUsageRollup()
    for (let i = 0; i < 50; i++) {
      const { telemetry } = await observe(
        post(
          { jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: `tool-${i}`, arguments: {} } },
          { 'User-Agent': `agent-${i}` },
        ),
      )
      rollup.record(telemetry)
    }
    rollup.record(rateLimitedTelemetry(new Headers({ 'User-Agent': 'agent' })))
    const buckets = rollup.drain()
    expect(buckets.length).toBeLessThanOrEqual(3)
    for (const bucket of buckets) {
      expect(['other', 'none']).toContain(bucket.tool)
      expect(bucket.clientClass).toBe('other')
    }
    expect(buckets.find((b) => b.outcome === 'rate_limited')?.count).toBe(1)
  })

  it('leaves the response untouched', async () => {
    const body = { jsonrpc: '2.0', id: 9, method: 'tools/list' }
    const direct = await handleMcpRequest(post(body), catalog)
    const { response } = await observe(post(body))
    expect(await response.text()).toBe(await direct.text())
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})