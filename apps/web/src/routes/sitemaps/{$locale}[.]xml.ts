import { createFileRoute } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { SUPPORTED_LOCALES } from '@/setup/locale'
import { SITEMAP_HEADERS, buildSitemap, sitemapFileName } from '../sitemap[.]xml'

// One language's sitemap (`/sitemaps/ja.xml`), listed in the index at /sitemap.xml
export const Route = createFileRoute('/sitemaps/{$locale}.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const locale = SUPPORTED_LOCALES.find((candidate) => sitemapFileName(candidate) === params.locale)
        if (!locale) return new Response('Not found', { status: 404 })
        return new Response(buildSitemap((await getCatalogDocument()).songs, locale), { headers: SITEMAP_HEADERS })
      },
    },
  },
})