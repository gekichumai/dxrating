import { readFileSync } from 'node:fs'
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './catalog'
import { handleMcpRequest } from './http'
import { LISTING_VERSION, MCP_PUBLIC_URL, mcpListing, mcpServerCard, serverCardResponse } from './listing'
import { SERVER_DESCRIPTION } from './server'
import { publishedCatalog } from './test-fixture'

const serverJson = JSON.parse(readFileSync(new URL('../../../../../server.json', import.meta.url), 'utf8'))

describe('listing', () => {
  it('is server.json, which the registry publishes', () => {
    expect(serverJson).toEqual(mcpListing())
    expect(serverJson.version).toBe(LISTING_VERSION)
    // the limits of the registry
    expect(SERVER_DESCRIPTION.length).toBeLessThanOrEqual(100)
    expect(serverJson.remotes).toEqual([{ type: 'streamable-http', url: 'https://mcp.dxrating.net/mcp' }])
  })

  it('names the server as serverInfo does', async () => {
    const response = await handleMcpRequest(
      new Request(MCP_PUBLIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
        }),
      }),
      buildMcpCatalog('1', publishedCatalog),
    )
    const { serverInfo } = (await response.json()).result
    const card = mcpServerCard(process.env.VERSION)
    expect(serverInfo).toMatchObject({
      name: card.name,
      title: card.title,
      version: card.version,
      description: card.description,
      icons: card.icons,
    })
  })
})

describe('server card', () => {
  it('has the build version and every protocol version', () => {
    const card = mcpServerCard('v1.7.0')
    expect(card).toMatchObject({
      $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
      name: 'net.dxrating/dxrating',
      version: '1.7.0',
      websiteUrl: 'https://mcp.dxrating.net/',
    })
    expect(card.remotes[0]).toEqual({
      type: 'streamable-http',
      url: MCP_PUBLIC_URL,
      supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    })
    expect(mcpServerCard('main').version).toBe('0.0.0-dev')
  })

  it('is served as its media type, and cached', async () => {
    const response = serverCardResponse('GET', 'v1.7.0')
    expect(response.headers.get('content-type')).toBe('application/mcp-server-card+json')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(await response.json()).toEqual(mcpServerCard('v1.7.0'))
    expect(await serverCardResponse('HEAD').text()).toBe('')
  })
})