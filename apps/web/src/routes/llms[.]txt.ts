import { createFileRoute } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'

export function buildLlmsTxt(catalogUpdatedAt: string) {
  return `# DXRating

DXRating is a maimai DX rating calculator and chart database. It provides canonical chart pages, localized metadata, score/rating tools, tags, comments, aliases, and chart facts such as difficulty, internal level, note counts, regions, release dates, and designers.

## Start Here: the Song Catalog

- https://miruku.dxrating.net/api/v1/dxdata returns every song, chart (sheet), internal level, version, tag and alias as one JSON document. No account or API key.
- Song IDs (dsng_...) and sheet IDs (dsht_...) are permanent and never reused; removed charts stay in the catalog with an empty serverIds list.
- Caching: the response has a strong ETag; revalidate with If-None-Match (304 while unchanged), or use HEAD for headers only. Browser cache 5 minutes, shared caches 6 hours. The catalog changes at most about once a day.

## Canonical Resources

- Site: https://dxrating.net/
- Developer and agent entry point: https://dxrating.net/developers
- Recent chart discovery: https://dxrating.net/charts/recent
- Trending chart discovery: https://dxrating.net/charts/trending
- Interactive song and chart search: https://dxrating.net/?q=
- Rating calculator: https://dxrating.net/rating
- Sitemap: https://dxrating.net/sitemap.xml
- OpenSearch description: https://dxrating.net/opensearch.xml
- Song catalog (JSON, every song and chart): https://miruku.dxrating.net/api/v1/dxdata
- API base: https://miruku.dxrating.net/api/v1
- API catalog: https://dxrating.net/.well-known/api-catalog
- API specification: https://miruku.dxrating.net/spec.json
- API documentation: https://miruku.dxrating.net/docs
- MCP server (Model Context Protocol, for AI assistants): https://mcp.dxrating.net/mcp
- MCP server setup guide: https://mcp.dxrating.net/

## URL Patterns

- Canonical chart page: https://dxrating.net/songs/{songId}/{type}/{difficulty}
- Song IDs are the stable public IDs of the song catalog (dsng_ followed by 10 characters); links that use a song's title redirect to its canonical page
- Chart types: dx, std, utage, utage2p
- Difficulties: basic, advanced, expert, master, remaster
- Chart Open Graph image: https://miruku.dxrating.net/api/v1/songs/{songId}/{type}/{difficulty}/og-image

## Languages

Languages: English, Japanese, Korean, Simplified Chinese, Traditional Chinese.

## Data Notes

- Song and chart metadata is the DXRating song catalog, served at https://miruku.dxrating.net/api/v1/dxdata.
- Data update time: ${catalogUpdatedAt}
- User-generated community data may include tags, comments, and aliases.
- Using the data: dxdata song and chart data is free to use, including commercially. Credit is appreciated: "Data from DXRating (dxrating.net)". Song titles, artwork and charts belong to SEGA and their rights holders. DXRating's code is MIT.

## API Stability (v1 is stable)

- Policy: https://dxrating.net/developers#api-stability
- Within v1, changes are additive only (new endpoints, optional parameters, response fields, enum values). Ignore unknown fields. Removing or renaming anything, or changing a type or meaning, is breaking.
- Deprecations get at least 6 months' notice, a changelog entry, and Deprecation (RFC 9745) and Sunset (RFC 8594) response headers.
- Breaking changes go into /api/v2; v1 keeps working for at least 12 months after v2 is stable.
- Covered: endpoints that need no sign-in. Endpoints that need a DXRating account are for DXRating's own apps.
- Rate limits: REST has no hard limit; cache and revalidate with If-None-Match (dxdata, tags, aliases and arcade venues send ETags). MCP: 300 requests per minute per client.
- Changelog (subscribe for notifications): https://github.com/gekichumai/dxrating/issues/427
- Support: https://github.com/gekichumai/dxrating/issues

## Citation Guidance

Prefer citing canonical chart URLs when answering chart-specific questions. Use /charts/recent for crawlable recent chart discovery, /charts/trending for popular chart discovery, and /?q= for interactive keyword search, but use the /songs/{songId}/{type}/{difficulty} page as the source for a specific chart's level, internal level, notes, regions, release date, designer, image, and rating table.
`
}

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildLlmsTxt((await getCatalogDocument()).updatedAt), {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          },
        }),
    },
  },
})