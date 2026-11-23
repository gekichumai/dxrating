import { CLOUD_SAVE_EXPECTED_USER_HEADER } from './private/cloud-save.ts'

/**
 * The browser-facing HTTP surface of the API: the paths outside the oRPC router, which CORS policy answers each request,
 * and the request headers the clients send. The backend builds its CORS from this module, and the web derives from it
 * the requests it may add Sentry trace headers to and the ones it sends cookies with.
 */

/** Names the calling client (an app, a bot or the edge cache) in the API usage metrics */
export const API_CLIENT_HEADER = 'X-DXRating-Client'
/** The Turnstile token of a sign-in or sign-up, read by Better Auth's captcha plugin */
export const CAPTCHA_RESPONSE_HEADER = 'x-captcha-response'
/** What Sentry's browser SDK adds to a request it traces */
export const TRACE_HEADERS = ['sentry-trace', 'baggage'] as const

export const DXDATA_PATH = '/api/v1/dxdata'
/** The v2 catalog (gekichumai/meta#43): the published catalog without its community data and repeated defaults */
export const DXDATA_V2_PATH = '/api/v2/dxdata'
/** The v2 community overlay (gekichumai/meta#43): tags and aliases by public ID, visible associations only */
export const DXDATA_V2_COMMUNITY_PATH = '/api/v2/dxdata/community'
export const ARCADE_VENUES_PATH = '/api/v1/arcades/venues'
export const MCP_PATH = '/mcp'
export const MCP_SERVER_CARD_PATH = '/mcp/server-card'

const API_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'] as const
export type ApiMethod = (typeof API_METHODS)[number]

export interface CorsPolicy {
  origin: string | ((origin: string) => string | null)
  allowHeaders: string[]
  allowMethods: string[]
  exposeHeaders: string[]
  maxAge: number
  credentials?: boolean
}

const LOCAL_DEV_ORIGIN = /^https?:\/\/(?:(?:[a-z0-9-]+\.)*localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/

const isFirstPartyWebOrigin = (origin: string) =>
  LOCAL_DEV_ORIGIN.test(origin) ||
  origin === 'https://dxrating.net' ||
  origin.endsWith('.dxrating.pages.dev') ||
  origin.endsWith('.galvin.workers.dev')

export type CorsGroup = 'api' | 'publicList' | 'catalog' | 'mcp'

export const CORS_POLICIES: Record<CorsGroup, CorsPolicy> = {
  api: {
    origin: (origin) => (isFirstPartyWebOrigin(origin) ? origin : null),
    allowHeaders: [
      'Content-Type',
      'Authorization',
      ...TRACE_HEADERS,
      CAPTCHA_RESPONSE_HEADER,
      API_CLIENT_HEADER,
      CLOUD_SAVE_EXPECTED_USER_HEADER,
    ],
    allowMethods: [...API_METHODS, 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'X-DXRating-Request-ID'],
    maxAge: 600,
    credentials: true,
  },
  /**
   * Reads of the tag, alias and announcement lists, which the edge shares between every caller. The edge ignores
   * `Vary: Origin`, so a cached copy must not carry one caller's reflected origin: they answer `*` without credentials.
   * Writes on the same paths (POST /aliases) are `api`.
   */
  publicList: {
    origin: '*',
    allowHeaders: ['Content-Type', 'If-None-Match', ...TRACE_HEADERS, API_CLIENT_HEADER],
    allowMethods: ['GET', 'HEAD', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'ETag', 'X-DXRating-Request-ID'],
    maxAge: 86400,
  },
  /** The static catalogs: one credential-independent representation per URL, shared by browsers and the CDN */
  catalog: {
    origin: '*',
    allowHeaders: ['Content-Type', 'If-None-Match', API_CLIENT_HEADER],
    allowMethods: ['GET', 'HEAD', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'ETag', 'Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control'],
    maxAge: 86400,
  },
  /** The MCP server takes no credentials and makes no writes: any page may call it, as browser-based MCP clients do */
  mcp: {
    origin: '*',
    // Mcp-Method and Mcp-Name mirror the method and tool of 2026-07-28 requests, which must carry them
    allowHeaders: [
      'Content-Type',
      'Accept',
      'Mcp-Protocol-Version',
      'Mcp-Method',
      'Mcp-Name',
      'Mcp-Session-Id',
      'Last-Event-ID',
    ],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Mcp-Session-Id', 'Mcp-Protocol-Version'],
    maxAge: 86400,
  },
}

/** The paths of every group but `api`, which answers the rest. `publicList` answers only their GET and HEAD. */
export const CORS_GROUP_PATHS = {
  catalog: [ARCADE_VENUES_PATH, DXDATA_PATH, DXDATA_V2_PATH, DXDATA_V2_COMMUNITY_PATH],
  publicList: ['/api/v1/tags', '/api/v1/aliases', '/api/v1/announcements'],
  mcp: [MCP_PATH, MCP_SERVER_CARD_PATH],
} satisfies Partial<Record<CorsGroup, string[]>>

/** The CORS policy of a request; a preflight passes the method it asks for */
export const corsGroupFor = (path: string, method: string): CorsGroup => {
  if (CORS_GROUP_PATHS.catalog.includes(path)) return 'catalog'
  if (CORS_GROUP_PATHS.publicList.includes(path) && (method === 'GET' || method === 'HEAD')) return 'publicList'
  if (CORS_GROUP_PATHS.mcp.includes(path)) return 'mcp'
  return 'api'
}

export const corsAllowsHeader = (group: CorsGroup, header: string) =>
  CORS_POLICIES[group].allowHeaders.some((allowed) => allowed.toLowerCase() === header.toLowerCase())

export const pathsRefusingHeader = (header: string): string[] =>
  Object.entries(CORS_GROUP_PATHS)
    .filter(([group]) => !corsAllowsHeader(group as CorsGroup, header))
    .flatMap(([, paths]) => paths)