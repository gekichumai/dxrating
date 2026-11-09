import { createFileRoute } from '@tanstack/react-router'
import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { songHubPath } from '@/components/sheet/sheetLinks'
import { CONSTANT_TABLE_LEVELS, constantTablePath } from '@/components/chartDiscovery/constantTables'
import { VERSION_PAGE_VERSIONS, versionPagePath } from '@/components/chartDiscovery/versionPages'
import { listIndexablePlateIds, platePath } from '@/components/plates/plateData'
import { buildLocalizedUrl } from '@/utils/alternateLinks'
import { DEFAULT_LOCALE, LOCALE_PATH_PREFIXES, SUPPORTED_LOCALES, type SupportedLocale } from '@/setup/locale'

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

// Each language's sitemap lists that language's URLs (meta#52); every entry carries the full hreflang cluster
const urlLoc = (path: string, locale: SupportedLocale) => escapeXml(buildLocalizedUrl({ pathname: path }, locale))

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

const constantTableEntries = (locale: SupportedLocale) =>
  [
    '/constants',
    ...CONSTANT_TABLE_LEVELS.map(constantTablePath),
    '/versions',
    ...VERSION_PAGE_VERSIONS.map(versionPagePath),
  ]
    .map(
      (path) => `
  <url>
    <loc>${urlLoc(path, locale)}</loc>${alternatesXml(path)}
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`,
    )
    .join('')

const plateEntries = (locale: SupportedLocale) =>
  ['/plates', ...listIndexablePlateIds().map(platePath)]
    .map(
      (path) => `
  <url>
    <loc>${urlLoc(path, locale)}</loc>${alternatesXml(path)}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join('')

const toolEntries = (locale: SupportedLocale) =>
  ['/tools/tolerance', '/tools/rating']
    .map(
      (path) => `
  <url>
    <loc>${urlLoc(path, locale)}</loc>${alternatesXml(path)}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join('')

// A song page changes when a chart is added: its newest chart's release date
const latestReleaseDate = (song: SitemapSong) =>
  (song.sheets ?? []).reduce<string | undefined>(
    (latest, sheet) => (sheet.releaseDate && (!latest || sheet.releaseDate > latest) ? sheet.releaseDate : latest),
    undefined,
  )

export function buildSitemap(songs: SitemapSong[], locale: SupportedLocale = DEFAULT_LOCALE) {
  // One page per song (`/songs/<id>`): every chart of the song in one table. Chart pages name the song page as their
  // canonical (utils/alternateLinks.ts), so they aren't listed
  const songHubEntries = songs
    .map((song) => ({ path: songHubPath(song.id), lastmod: latestReleaseDate(song) }))
    .map(
      ({ path, lastmod }) => `
  <url>
    <loc>${urlLoc(path, locale)}</loc>${alternatesXml(path)}${lastmodXml(lastmod)}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${urlLoc('/', locale)}</loc>${alternatesXml('/')}
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${urlLoc('/charts/recent', locale)}</loc>${alternatesXml('/charts/recent')}
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${urlLoc('/charts/trending', locale)}</loc>${alternatesXml('/charts/trending')}
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${urlLoc('/rating', locale)}</loc>${alternatesXml('/rating')}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${urlLoc('/developers', locale)}</loc>${alternatesXml('/developers')}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${urlLoc('/random', locale)}</loc>${alternatesXml('/random')}
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>${toolEntries(locale)}${constantTableEntries(locale)}${plateEntries(locale)}${songHubEntries}
</urlset>`
}

/** The file name of a language's sitemap: its path prefix (`zh-hans`), `en` for English */
export const sitemapFileName = (locale: SupportedLocale) =>
  locale === DEFAULT_LOCALE ? DEFAULT_LOCALE : LOCALE_PATH_PREFIXES[locale]

/**
 * The sitemap index: one sitemap per language. A single file listing every language's URL would pass the 50,000-URL
 * limit (about 9,400 pages × 11 languages).
 */
export function buildSitemapIndex() {
  const entries = SUPPORTED_LOCALES.map(
    (locale) => `
  <sitemap>
    <loc>${BASE_URL}/sitemaps/${sitemapFileName(locale)}.xml</loc>
  </sitemap>`,
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}
</sitemapindex>`
}

export const SITEMAP_HEADERS = {
  'Content-Type': 'application/xml',
  'Cache-Control': 'public, max-age=3600',
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => new Response(buildSitemapIndex(), { headers: SITEMAP_HEADERS }),
    },
  },
})