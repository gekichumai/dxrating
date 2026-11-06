import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { TolerancePage, type ToleranceSelectedSheet } from '@/pages/tools/TolerancePage'
import { keepLocaleSearch } from '@/setup/locale'
import { buildToolPageSeo, resolveSeoLocale } from '@/utils/seo'

type ToleranceSearch = { sheet?: string }

export const validateToleranceSearch = (search: Record<string, unknown>): ToleranceSearch => ({
  sheet: typeof search.sheet === 'string' && /^dsht_[A-Za-z0-9]{1,32}$/.test(search.sheet) ? search.sheet : undefined,
})

type CatalogSong = SongCatalogDocument['songs'][number]
type CatalogSheet = CatalogSong['sheets'][number]

export const toToleranceSheet = (song: CatalogSong, sheet: CatalogSheet): ToleranceSelectedSheet => ({
  id: sheet.id,
  songId: song.id,
  title: song.title,
  imageName: song.imageName,
  type: sheet.type,
  difficulty: sheet.difficulty,
  internalLevelValue: sheet.internalLevelValue,
  noteCounts: sheet.noteCounts,
})

export async function loadToleranceSheet(sheetId: string | undefined): Promise<ToleranceSelectedSheet | null> {
  if (!sheetId) return null
  const document = await getCatalogDocument()
  for (const song of document.songs) {
    const sheet = song.sheets.find((s) => s.id === sheetId)
    if (sheet) return toToleranceSheet(song, sheet)
  }
  return null
}

/**
 * The chart picker. A chart's calculator lives under the chart (`/songs/<id>/<type>/<difficulty>/tolerance`); links
 * from before that, `/tools/tolerance?sheet=<id>`, are sent there permanently.
 */
export const Route = createFileRoute('/tools/tolerance')({
  ssr: true,
  validateSearch: validateToleranceSearch,
  loaderDeps: ({ search }) => ({ sheet: search.sheet }),
  loader: async ({ deps, location }) => {
    const sheet = await loadToleranceSheet(deps.sheet)
    if (sheet) {
      throw redirect({
        to: '/songs/$songId/$type/$difficulty/tolerance',
        params: { songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty },
        ...keepLocaleSearch(location.search),
        statusCode: 308,
        replace: true,
      })
    }
    return {}
  },
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
  return <TolerancePage sheet={null} />
}