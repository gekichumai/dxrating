import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './catalog'
import { clientKey, createRateLimiter, handleMcpRequest, MCP_MAX_BODY_BYTES } from './http'
import { publishedCatalog, UMIYURI } from './test-fixture'

const catalog = buildMcpCatalog('1', publishedCatalog)

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://mcp.dxrating.net/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  })

describe('MCP endpoint', () => {
  it('answers an initialize with JSON and no session', async () => {
    const response = await handleMcpRequest(
      post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      }),
      catalog,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('mcp-session-id')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.result.serverInfo.name).toBe('net.dxrating/dxrating')
  })

  it('answers a tool call without an initialize first, as the transport is stateless', async () => {
    const response = await handleMcpRequest(
      post(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'search_songs', arguments: { query: 'umiyuri' } },
        },
        { 'Mcp-Protocol-Version': '2025-06-18' },
      ),
      catalog,
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.result.structuredContent.songs[0].songId).toBe(UMIYURI)
  })

  // 2026-07-28 has no initialize: every request carries its version, client info and capabilities in _meta, and the
  // MCP-Protocol-Version and Mcp-Method headers mirror them (DXRATING-BACKEND-2C)
  const modern = (id: number, method: string, params: Record<string, unknown> = {}) =>
    post(
      {
        jsonrpc: '2.0',
        id,
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
      {
        'Mcp-Protocol-Version': '2026-07-28',
        'Mcp-Method': method,
        ...(typeof params.name === 'string' ? { 'Mcp-Name': params.name } : {}),
      },
    )

  it('serves 2026-07-28 requests: server/discover, then tools/list and tools/call', async () => {
    const discover = await handleMcpRequest(modern(1, 'server/discover'), catalog)
    expect(discover.status).toBe(200)
    expect(discover.headers.get('cache-control')).toBe('no-store')
    const discovered = await discover.json()
    expect(discovered.result.supportedVersions).toContain('2026-07-28')
    expect(discovered.result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('net.dxrating/dxrating')

    const list = await handleMcpRequest(modern(2, 'tools/list'), catalog)
    expect(list.status).toBe(200)
    expect(list.headers.get('content-type')).toContain('application/json')
    expect((await list.json()).result.tools).toHaveLength(5)

    const call = await handleMcpRequest(
      modern(3, 'tools/call', { name: 'search_songs', arguments: { query: 'umiyuri' } }),
      catalog,
    )
    expect(call.status).toBe(200)
    expect((await call.json()).result.structuredContent.songs[0].songId).toBe(UMIYURI)
  })

  it('negotiates down an initialize that asks for 2026-07-28, and serves the requests after it', async () => {
    const init = await handleMcpRequest(
      post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2026-07-28', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      }),
      catalog,
    )
    expect(init.status).toBe(200)
    const negotiated = (await init.json()).result.protocolVersion
    expect(negotiated).toBe('2025-11-25')

    const list = await handleMcpRequest(
      post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'Mcp-Protocol-Version': negotiated }),
      catalog,
    )
    expect(list.status).toBe(200)
    expect((await list.json()).result.tools).toHaveLength(5)
  })

  it('answers a revision it does not serve with UnsupportedProtocolVersionError, so the client can retry', async () => {
    const request = modern(1, 'tools/list')
    const body = await request.json()
    body.params._meta['io.modelcontextprotocol/protocolVersion'] = '2099-01-01'
    const response = await handleMcpRequest(
      post(body, { 'Mcp-Protocol-Version': '2099-01-01', 'Mcp-Method': 'tools/list' }),
      catalog,
    )
    expect(response.status).toBe(400)
    const { error } = await response.json()
    expect(error.code).toBe(-32022)
    expect(error.data.supported).toContain('2026-07-28')
  })

  it('works with SDK clients on either revision', async () => {
    const versions: (string | null)[] = []
    const fetch = async (url: string | URL, init?: RequestInit) => {
      const request = new Request(url, init)
      versions.push(request.headers.get('mcp-protocol-version'))
      return handleMcpRequest(request, catalog)
    }
    for (const mode of [{ pin: '2026-07-28' }, 'auto', 'legacy'] as const) {
      versions.length = 0
      const client = new Client({ name: 'test', version: '1' }, { versionNegotiation: { mode } })
      await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.dxrating.net/mcp'), { fetch }))
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name)).toContain('search_songs')
      // a client that can speak 2026-07-28 stays on it; only the legacy client negotiates 2025-11-25
      expect(versions.at(-1)).toBe(mode === 'legacy' ? '2025-11-25' : '2026-07-28')
      await client.close()
    }
  })

  it('has no stream of server messages and no sessions', async () => {
    for (const method of ['GET', 'DELETE']) {
      const response = await handleMcpRequest(new Request('https://mcp.dxrating.net/mcp', { method }), catalog)
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST, OPTIONS')
    }
  })

  it('refuses a body too large', async () => {
    const request = post({ jsonrpc: '2.0', id: 3, method: 'ping', params: { pad: 'x'.repeat(MCP_MAX_BODY_BYTES) } })
    const response = await handleMcpRequest(
      new Request(request, {
        headers: { ...Object.fromEntries(request.headers), 'content-length': String(MCP_MAX_BODY_BYTES + 100) },
      }),
      catalog,
    )
    expect(response.status).toBe(413)
  })
})

describe('MCP rate limit', () => {
  it('limits each client per window', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 })
    expect(limiter.take('a', 0)).toBe(0)
    expect(limiter.take('a', 1_000)).toBe(0)
    expect(limiter.take('a', 2_000)).toBe(58)
    expect(limiter.take('b', 2_000)).toBe(0)
    expect(limiter.take('a', 60_000)).toBe(0)
  })

  it('trusts CF-Connecting-IP only behind a Cloudflare hop', () => {
    // Traefik appends the Cloudflare edge address it accepted the connection from
    expect(clientKey(new Headers({ 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '162.158.1.2' }))).toBe(
      '203.0.113.1',
    )
    expect(
      clientKey(new Headers({ 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '9.9.9.9, 2606:4700::1' })),
    ).toBe('203.0.113.1')
    // a spoofed header from a peer outside Cloudflare is ignored, as is a spoofed left-hand forwarded entry
    expect(
      clientKey(new Headers({ 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '162.158.1.2, 198.51.100.7' })),
    ).toBe('198.51.100.7')
    expect(clientKey(new Headers({ 'cf-connecting-ip': '203.0.113.1' }), '198.51.100.7')).toBe('198.51.100.7')
    expect(clientKey(new Headers({ 'cf-connecting-ip': '203.0.113.1' }), '::ffff:198.51.100.7')).toBe('198.51.100.7')
    expect(clientKey(new Headers({ 'cf-connecting-ip': 'garbage', 'x-forwarded-for': '162.158.1.2' }))).toBe(
      '162.158.1.2',
    )
    expect(clientKey(new Headers())).toBe('unknown')
    expect(clientKey(new Headers(), '127.0.0.1')).toBe('127.0.0.1')
  })

  it('groups IPv6 clients by /64', () => {
    const behindCloudflare = (ip: string) =>
      clientKey(new Headers({ 'cf-connecting-ip': ip, 'x-forwarded-for': '172.64.0.9' }))
    expect(behindCloudflare('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64')
    expect(behindCloudflare('2001:0db8:0001:0002:ffff:1:2:3')).toBe('2001:db8:1:2::/64')
    expect(behindCloudflare('2001:db8::5')).toBe('2001:db8:0:0::/64')
    expect(clientKey(new Headers(), '::1')).toBe('0:0:0:0::/64')
  })
})