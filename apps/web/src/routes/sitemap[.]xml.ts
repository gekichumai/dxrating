import { createFileRoute } from '@tanstack/react-router'
import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { buildSheetPath, songHubPath } from '@/components/sheet/sheetLinks'
import { CONSTANT_TABLE_LEVELS, constantTablePath } from '@/components/chartDiscovery/constantTables'
import { VERSION_PAGE_VERSIONS, versionPagePath } from '@/components/chartDiscovery/versionPages'
import { listIndexablePlateIds, platePath } from '@/components/plates/plateData'
import { buildLocalizedUrl } from '@/utils/alternateLinks'
import { SUPPORTED_LOCALES } from '@/setup/locale'

const BASE_URL = 'https://dxrating.net'

type SitemapSong = {
  id: string
  sheets?: {
    type: TypeEnum
    difficulty: DifficultyEnum
    releaseDate?: string
  }[]
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const urlLoc = (path: string) => escapeXml(`${BASE_URL}${path}`)

// The same hreflang cluster the pages declare (see buildAlternateLinks)
const alternatesXml = (path: string) =>
  [
    `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(buildLocalizedUrl({ pathname: path }))}"/>`,
    ...SUPPORTED_LOCALES.map(
      (locale) =>
        `\n    <xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(buildLocalizedUrl({ pathname: path }, locale))}"/>`,
    ),
  ].join('')

const lastmodXml = (releaseDate?: string) => (releaseDate ? `\n    <lastmod>${escapeXml(releaseDate)}</lastmod>` : '')

const constantTableEntries = [
  '/constants',
  ...CONSTANT_TABLE_LEVELS.map(constantTablePath),
  '/versions',
  ...VERSION_PAGE_VERSIONS.map(versionPagePath),
]
  .map(
    (path) => `
  <url>
    <loc>${urlLoc(path)}</loc>${alternatesXml(path)}
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`,
  )
  .join('')

const plateEntries = ['/plates', ...listIndexablePlateIds().map(platePath)]
  .map(
    (path) => `
  <url>
    <loc>${urlLoc(path)}</loc>${alternatesXml(path)}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
  )
  .join('')

const toolEntries = ['/tools/tolerance', '/tools/rating']
  .map(
    (path) => `
  <url>
    <loc>${urlLoc(path)}</loc>${alternatesXml(path)}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`,
  )
  .join('')

export function buildSitemap(songs: SitemapSong[]) {
  const sheetEntries = songs
    .flatMap((song) =>
      (song.sheets ?? []).map((sheet) => ({
        songId: song.id,
        sheet,
      })),
    )
    .sort((a, b) => (b.sheet.releaseDate ?? '').localeCompare(a.sheet.releaseDate ?? ''))
    .map(({ songId, sheet }) => ({
      sheet,
      path: buildSheetPath({ songId, type: sheet.type, difficulty: sheet.difficulty }),
    }))
    .map(
      ({ sheet, path }) => `
  <url>
    <loc>${urlLoc(path)}</loc>${alternatesXml(path)}${lastmodXml(sheet.releaseDate)}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`,
    )
    .join('')

  // One hub per song (`/songs/<id>`): every chart of the song in one table
  const songHubEntries = songs
    .map((song) => songHubPath(song.id))
    .map(
      (path) => `
  <url>
    <loc>${urlLoc(path)}</loc>${alternatesXml(path)}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${urlLoc('/')}</loc>${alternatesXml('/')}
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${urlLoc('/charts/recent')}</loc>${alternatesXml('/charts/recent')}
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${urlLoc('/charts/trending')}</loc>${alternatesXml('/charts/trending')}
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${urlLoc('/rating')}</loc>${alternatesXml('/rating')}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${urlLoc('/developers')}</loc>${alternatesXml('/developers')}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${urlLoc('/random')}</loc>${alternatesXml('/random')}
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>${toolEntries}${constantTableEntries}${plateEntries}${songHubEntries}${sheetEntries}
</urlset>`
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const sitemap = buildSitemap((await getCatalogDocument()).songs)

        return new Response(sitemap, {
          headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})