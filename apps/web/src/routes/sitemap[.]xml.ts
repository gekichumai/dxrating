import { createFileRoute } from '@tanstack/react-router'
import { dxdata } from '@gekichumai/dxdata'

const BASE_URL = 'https://dxrating.net'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const songEntries = dxdata.songs
          .map(
            (song) => `
  <url>
    <loc>${BASE_URL}/songs/${song.songId}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`,
          )
          .join('')

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/search</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${BASE_URL}/rating</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>${songEntries}
</urlset>`

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