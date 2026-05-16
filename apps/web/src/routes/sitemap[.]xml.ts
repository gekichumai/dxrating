import { createFileRoute } from '@tanstack/react-router'
import { dxdata } from '@gekichumai/dxdata'

const BASE_URL = 'https://dxrating.net'

type SitemapSong = {
  songId: string
  sheets?: {
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

const latestReleaseDate = (song: SitemapSong) =>
  song.sheets?.reduce((latest, sheet) => {
    if (!sheet.releaseDate) return latest
    return sheet.releaseDate > latest ? sheet.releaseDate : latest
  }, '') ?? ''

export function buildSitemap(songs: SitemapSong[]) {
  const songEntries = [...songs]
    .sort((a, b) => latestReleaseDate(b).localeCompare(latestReleaseDate(a)))
    .map(
      (song) => `
  <url>
    <loc>${urlLoc(`/songs/${encodeURIComponent(song.songId)}`)}</loc>
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
  </url>${songEntries}
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