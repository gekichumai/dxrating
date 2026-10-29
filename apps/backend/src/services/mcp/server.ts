import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { McpCatalog } from './catalog'
import { CATALOG_LOADING_MESSAGE, SITE_URL, toolError } from './output'
import { getSheetTool, runGetSheet } from './tool-get-sheet'
import { runSearchSongs, searchSongsTool } from './tool-search-songs'

// The read-only MCP server (https://modelcontextprotocol.io) of the DXRating song catalog, for AI assistants. Each
// tool has a file of its own (tool-<name>.ts) and a line in createMcpServer; output.ts has what their results share,
// catalog.ts the catalog and its search, loader.ts the loading of the catalog, http.ts the endpoint.

/** The name of the server for programs, as the MCP Registry will list it */
export const SERVER_NAME = 'net.dxrating/dxrating'
export const SERVER_TITLE = 'DXRating'
export const SERVER_DESCRIPTION = 'maimai DX songs and charts: levels, internal levels, note counts, aliases and tags'

/**
 * Tell the model what the data is and which tool answers which question (600 characters at most, as clients may cut
 * them). They name every tool, as a client that loads tools on demand may have loaded only some of them.
 */
export const INSTRUCTIONS =
  'DXRating (dxrating.net): the maimai DX song catalog, with the level and internal level (譜面定数) of every chart. ' +
  'Find a song by any name, alias or nickname in any language with search_songs, then get its charts with ' +
  "get_sheet; don't trust remembered internal levels, which change between versions. Charts differ by server " +
  '(jp, intl, usa, cn): ask which one the user plays on when it matters. Credit DXRating, CC BY-NC 4.0.'

/** Every tool only reads the catalog, and the same arguments give the same result until the catalog changes. */
const annotations = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
})

/** The version of the server: the release of the build, without its v, or a pre-release of 0.0.0 */
export function serverVersion(build: string | undefined): string {
  const version = build?.replace(/^v/, '')
  return version && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) ? version : '0.0.0-dev'
}

/**
 * The MCP server of catalog, for one request (the transport is stateless). Without a catalog, before the first one
 * is loaded, the tools answer that the data is still loading.
 */
export function createMcpServer(catalog: McpCatalog | undefined, build = process.env.VERSION): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      title: SERVER_TITLE,
      version: serverVersion(build),
      websiteUrl: SITE_URL,
    },
    { instructions: INSTRUCTIONS, capabilities: { tools: {} } },
  )

  const withCatalog =
    <In>(run: (catalog: McpCatalog, input: In) => CallToolResult) =>
    (input: In): CallToolResult =>
      catalog ? run(catalog, input) : toolError(CATALOG_LOADING_MESSAGE)

  server.registerTool(
    searchSongsTool.name,
    { ...searchSongsTool.config, annotations: annotations(searchSongsTool.config.title) },
    withCatalog(runSearchSongs),
  )
  server.registerTool(
    getSheetTool.name,
    { ...getSheetTool.config, annotations: annotations(getSheetTool.config.title) },
    withCatalog(runGetSheet),
  )
  return server
}