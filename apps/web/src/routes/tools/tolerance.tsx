import { createFileRoute } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { TolerancePage, type ToleranceSelectedSheet } from '@/pages/tools/TolerancePage'
import { buildToolPageSeo, resolveSeoLocale } from '@/utils/seo'

type ToleranceSearch = { sheet?: string }

export const validateToleranceSearch = (search: Record<string, unknown>): ToleranceSearch => ({
  sheet: typeof search.sheet === 'string' && /^dsht_[A-Za-z0-9]{1,32}$/.test(search.sheet) ? search.sheet : undefined,
})

export async function loadToleranceSheet(sheetId: string | undefined): Promise<ToleranceSelectedSheet | null> {
  if (!sheetId) return null
  const document = await getCatalogDocument()
  for (const song of document.songs) {
    const sheet = song.sheets.find((s) => s.id === sheetId)
    if (sheet) {
      return {
        id: sheet.id,
        songId: song.id,
        title: song.title,
        imageName: song.imageName,
        type: sheet.type,
        difficulty: sheet.difficulty,
        internalLevelValue: sheet.internalLevelValue,
        noteCounts: sheet.noteCounts,
      }
    }
  }
  return null
}

export const Route = createFileRoute('/tools/tolerance')({
  ssr: true,
  validateSearch: validateToleranceSearch,
  loaderDeps: ({ search }) => ({ sheet: search.sheet }),
  loader: async ({ deps }) => ({ sheet: await loadToleranceSheet(deps.sheet) }),
  head: ({ match, matches }) => {
    const seo = buildToolPageSeo(resolveSeoLocale([match, ...matches]), 'tolerance')
    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: ToleranceRouteComponent,
})

function ToleranceRouteComponent() {
  const { sheet } = Route.useLoaderData()
  return <TolerancePage sheet={sheet} />
}