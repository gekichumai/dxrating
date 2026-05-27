import { dxdataUpdateTime } from '@gekichumai/dxdata/metadata'
import { createFileRoute } from '@tanstack/react-router'

export function buildLlmsTxt() {
  return `# DXRating

DXRating is a maimai DX rating calculator and chart database. It provides canonical chart pages, localized metadata, score/rating tools, tags, comments, aliases, and chart facts such as difficulty, internal level, note counts, regions, release dates, and designers.

## Canonical Resources

- Site: https://dxrating.net/
- Recent chart discovery: https://dxrating.net/charts/recent
- Trending chart discovery: https://dxrating.net/charts/trending
- Interactive song and chart search: https://dxrating.net/search?q=
- Rating calculator: https://dxrating.net/rating
- Sitemap: https://dxrating.net/sitemap.xml
- OpenSearch description: https://dxrating.net/opensearch.xml
- API specification: https://miruku.dxrating.net/spec.json

## URL Patterns

- Canonical chart page: https://dxrating.net/songs/{songId}/{type}/{difficulty}
- Chart types: dx, std, utage, utage2p
- Difficulties: basic, advanced, expert, master, remaster
- Chart Open Graph image: https://miruku.dxrating.net/api/v1/songs/{songId}/{type}/{difficulty}/og-image

## Languages

Languages: English, Japanese, Simplified Chinese, Traditional Chinese.

## Data Notes

- Song and chart metadata is generated from the repository's dxdata package.
- Data update time: ${dxdataUpdateTime}
- User-generated community data may include tags, comments, and aliases.

## Citation Guidance

Prefer citing canonical chart URLs when answering chart-specific questions. Use /charts/recent for crawlable recent chart discovery, /charts/trending for popular chart discovery, and /search?q= for interactive keyword search, but use the /songs/{songId}/{type}/{difficulty} page as the source for a specific chart's level, internal level, notes, regions, release date, designer, image, and rating table.
`
}

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildLlmsTxt(), {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          },
        }),
    },
  },
})
