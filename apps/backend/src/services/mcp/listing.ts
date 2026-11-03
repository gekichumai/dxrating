import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'
import { ICONS } from './output'
import { SERVER_DESCRIPTION, SERVER_NAME, SERVER_TITLE, serverVersion } from './server'

// Where the server is listed and described before a client connects: server.json at the root of the repository, the
// listing in the official MCP Registry (https://registry.modelcontextprotocol.io), which
// .github/workflows/mcp-registry.yml publishes, and the server card at /mcp/server-card (SEP-2127), which clients and
// directories fetch. listing.test.ts keeps server.json equal to mcpListing().

/**
 * The version of the listing, not of the backend, which is released far more often than the listing changes: bump it
 * with every change of server.json, as the registry keeps each version for good and refuses one it already has. The
 * server card and serverInfo have the version of the build instead.
 */
export const LISTING_VERSION = '1.1.0'

/** The host the server is reached at; the backend answers other hosts too, whose root is something else */
export const MCP_HOST = 'mcp.dxrating.net'
/** The public URL of the server, the remote of the listing; never a preview host */
export const MCP_PUBLIC_URL = `https://${MCP_HOST}/mcp`
/** The setup guide, at the root of the host, the website of the listing */
export const MCP_GUIDE_URL = `https://${MCP_HOST}/`
export const MCP_SERVER_CARD_PATH = '/mcp/server-card'
export const MCP_SERVER_CARD_URL = `https://${MCP_HOST}${MCP_SERVER_CARD_PATH}`

/** This repository on GitHub; the ID survives a rename or a transfer */
export const REPOSITORY = {
  url: 'https://github.com/gekichumai/dxrating',
  source: 'github',
  id: '706001155',
  subfolder: 'apps/backend',
} as const

/** server.json */
export function mcpListing() {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: SERVER_NAME,
    title: SERVER_TITLE,
    description: SERVER_DESCRIPTION,
    version: LISTING_VERSION,
    websiteUrl: MCP_GUIDE_URL,
    repository: REPOSITORY,
    icons: ICONS,
    remotes: [{ type: 'streamable-http', url: MCP_PUBLIC_URL }],
  }
}

export const SERVER_CARD_CONTENT_TYPE = 'application/mcp-server-card+json'

/**
 * The server card of the build build. Its name and version are those of serverInfo, which clients reconcile it with;
 * the rest says what server.json says. The server is stateless, so it serves every protocol version of the SDK.
 */
export function mcpServerCard(build = process.env.VERSION) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: SERVER_NAME,
    version: serverVersion(build),
    description: SERVER_DESCRIPTION,
    title: SERVER_TITLE,
    websiteUrl: MCP_GUIDE_URL,
    repository: REPOSITORY,
    icons: ICONS,
    remotes: [
      { type: 'streamable-http', url: MCP_PUBLIC_URL, supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS] },
    ],
  }
}

/** The response of the card, to GET and HEAD whatever their Accept; clients and CDNs keep it for an hour */
export function serverCardResponse(method: string, build?: string): Response {
  return new Response(method === 'HEAD' ? null : `${JSON.stringify(mcpServerCard(build), null, 2)}\n`, {
    headers: { 'Content-Type': SERVER_CARD_CONTENT_TYPE, 'Cache-Control': 'public, max-age=3600' },
  })
}