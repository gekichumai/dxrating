import * as Sentry from '@sentry/node'
import { afterAll, describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './catalog'
import { handleMcpRequest } from './http'
import { publishedCatalog } from './test-fixture'

const spans: string[] = []

describe('MCP with a Sentry client', () => {
  Sentry.init({
    dsn: 'https://public@o0.ingest.sentry.io/0',
    tracesSampleRate: 1,
    transport: () => ({ send: async () => ({}), flush: async () => true }),
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
})