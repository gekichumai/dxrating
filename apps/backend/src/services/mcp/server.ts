import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { McpCatalog } from './catalog'
import { CATALOG_LOADING_MESSAGE, ICONS, SITE_URL, toolError } from './output'
import { calculateBest50Tool, runCalculateBest50 } from './tool-calculate-best50'
import { calculateRatingTool, runCalculateRating } from './tool-calculate-rating'
import { getSheetTool, runGetSheet } from './tool-get-sheet'
import { runSearchSongs, searchSongsTool } from './tool-search-songs'

// The read-only MCP server (https://modelcontextprotocol.io) of the DXRating song catalog, for AI assistants. Each
// tool has a file of its own (tool-<name>.ts) and a line in createMcpServer; output.ts has what their results share,
// catalog.ts the catalog and its search, loader.ts the loading of the catalog, http.ts the endpoint, listing.ts
// server.json and the server card, guide.ts the setup guide at the root of the host.

/** The name of the server for programs, as the MCP Registry will list it */
/** The names of the tools the server registers: telemetry keeps these and folds any other name into `other` */
export const MCP_TOOL_NAMES: readonly string[] = [
  searchSongsTool.name,
  getSheetTool.name,
  calculateRatingTool.name,
  calculateBest50Tool.name,
]

export const SERVER_NAME = 'net.dxrating/dxrating'
export const SERVER_TITLE = 'DXRating'
/** What the server is, in 100 characters at most (the limit of the registry) */
export const SERVER_DESCRIPTION =
  'maimai DX songs, charts and internal levels, and rating and Best 50 calculators, from DXRating'

/**
 * Tell the model what the data is and which tool answers which question (600 characters at most, as clients may cut
 * them). They name every tool, as a client that loads tools on demand may have loaded only some of them.
 */
export const INSTRUCTIONS =
  'DXRating (dxrating.net): maimai DX songs, chart internal levels (譜面定数) and ratings. Find a song by any name ' +
  "or alias with search_songs; chart details: get_sheet. Don't trust remembered internal levels. Ratings: " +
  'calculate_rating (one chart, or the achievement a rating needs), calculate_best50 (b15 + b35 and what to ' +
  'improve). Achievements are integers in 1/10000 %: 100.7543% is 1007543. Servers differ (jp, intl, usa, cn): ' +
  'ask which one the user plays. Credit DXRating, CC BY-NC 4.0.'

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
      description: SERVER_DESCRIPTION,
      websiteUrl: SITE_URL,
      icons: ICONS,
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
  server.registerTool(
    calculateRatingTool.name,
    { ...calculateRatingTool.config, annotations: annotations(calculateRatingTool.config.title) },
    withCatalog(runCalculateRating),
  )
  server.registerTool(
    calculateBest50Tool.name,
    { ...calculateBest50Tool.config, annotations: annotations(calculateBest50Tool.config.title) },
    withCatalog(runCalculateBest50),
  )
  return server
}