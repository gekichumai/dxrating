import { createFileRoute } from '@tanstack/react-router'
import { type DifficultyEnum, type TypeEnum, dxdata } from '@gekichumai/dxdata'
import { buildSheetPath } from '@/components/sheet/sheetLinks'
import { buildLocalizedUrl } from '@/utils/alternateLinks'
import { SUPPORTED_LOCALES } from '@/setup/locale'

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

// HTML heads own reciprocal hreflang links; the sitemap lists every canonical locale URL.
const localizedUrlEntries = (path: string, changefreq: string, priority: number, releaseDate?: string) =>
  SUPPORTED_LOCALES.map(
    (locale) => `
  <url>
    <loc>${escapeXml(buildLocalizedUrl({ pathname: path }, locale))}</loc>${
      releaseDate
        ? `
    <lastmod>${escapeXml(releaseDate)}</lastmod>`
        : ''
    }
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
  ).join('')

export function buildSitemap(songs: SitemapSong[]) {
  const sheetEntries = songs
    .flatMap((song) =>
      (song.sheets ?? []).map((sheet) => ({
        songId: song.songId,
        sheet,
      })),
    )
    .sort((a, b) => (b.sheet.releaseDate ?? '').localeCompare(a.sheet.releaseDate ?? ''))
    .map(({ songId, sheet }) =>
      localizedUrlEntries(
        buildSheetPath({ songId, type: sheet.type, difficulty: sheet.difficulty }),
        'monthly',
        0.7,
        sheet.releaseDate,
      ),
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${localizedUrlEntries('/search', 'daily', 0.9)}${localizedUrlEntries('/charts/recent', 'daily', 0.9)}${localizedUrlEntries('/charts/trending', 'daily', 0.9)}${localizedUrlEntries('/rating', 'weekly', 0.8)}${localizedUrlEntries('/developers', 'weekly', 0.8)}${sheetEntries}
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