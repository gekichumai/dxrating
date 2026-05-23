import { createFileRoute } from '@tanstack/react-router'
import { type DifficultyEnum, type TypeEnum, dxdata } from '@gekichumai/dxdata'
import { buildSheetPath } from '@/components/sheet/sheetLinks'

const BASE_URL = 'https://dxrating.net'

type SitemapSong = {
  songId: string
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

const lastmodXml = (releaseDate?: string) => (releaseDate ? `\n    <lastmod>${escapeXml(releaseDate)}</lastmod>` : '')

export function buildSitemap(songs: SitemapSong[]) {
  const sheetEntries = songs
    .flatMap((song) =>
      (song.sheets ?? []).map((sheet) => ({
        songId: song.songId,
        sheet,
      })),
    )
    .sort((a, b) => (b.sheet.releaseDate ?? '').localeCompare(a.sheet.releaseDate ?? ''))
    .map(
      ({ songId, sheet }) => `
  <url>
    <loc>${urlLoc(
      buildSheetPath({
        songId,
        type: sheet.type,
        difficulty: sheet.difficulty,
      }),
    )}</loc>${lastmodXml(sheet.releaseDate)}
	    <changefreq>monthly</changefreq>
	    <priority>0.7</priority>
	  </url>`,
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${urlLoc('/')}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${urlLoc('/search')}</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${urlLoc('/rating')}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>${sheetEntries}
</urlset>`
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const sitemap = buildSitemap(dxdata.songs)

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