import * as Sentry from '@sentry/node'
import { afterAll, describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './catalog'
import { handleMcpRequest, NOT_ACCEPTABLE } from './http'
import { publishedCatalog } from './test-fixture'

const spans: string[] = []
const exceptions: string[] = []

describe('MCP with a Sentry client', () => {
  Sentry.init({
    dsn: 'https://public@o0.ingest.sentry.io/0',
    tracesSampleRate: 1,
    transport: () => ({ send: async () => ({}), flush: async () => true }),
    beforeSend(event) {
      for (const exception of event.exception?.values ?? []) exceptions.push(String(exception.value))
      return null
    },
    beforeSendTransaction(event) {
      for (const span of event.spans ?? []) spans.push(String(span.op))
      spans.push(String(event.contexts?.trace?.op))
      return null
    },
  })
  afterAll(() => Sentry.close())

  it('answers through the Sentry-wrapped server', async () => {
    const catalog = buildMcpCatalog('1', publishedCatalog)
    const response = await handleMcpRequest(
      new Request('https://mcp.dxrating.net/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'search_songs', arguments: { query: 'a' } },
        }),
      }),
      catalog,
    )
    const body = await response.json()
    expect(body.result).toBeDefined()
    await Sentry.flush(1000)
    expect(spans.some((op) => op.startsWith('mcp'))).toBe(true)
  })

  const initialize = (headers: Record<string, string>) =>
    new Request('https://mcp.dxrating.net/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      }),
    })

  // DXRATING-BACKEND-2F: the transport reported this client mistake through onerror, which Sentry captured
  it('answers a request that does not accept JSON and SSE with 406, without reporting it', async () => {
    exceptions.length = 0
    const response = await handleMcpRequest(
      initialize({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      buildMcpCatalog('1', publishedCatalog),
    )
    expect(response.status).toBe(406)
    expect((await response.json()).error).toEqual({ code: -32000, message: NOT_ACCEPTABLE })
    await Sentry.flush(1000)
    expect(exceptions).toEqual([])
  })

  it('still reports the errors the transport raises past that check', async () => {
    exceptions.length = 0
    const response = await handleMcpRequest(
      initialize({ 'Content-Type': 'text/plain', Accept: 'application/json, text/event-stream' }),
      buildMcpCatalog('1', publishedCatalog),
    )
    expect(response.status).toBe(415)
    await Sentry.flush(1000)
    expect(exceptions).toContain('Unsupported Media Type: Content-Type must be application/json')
  })
})