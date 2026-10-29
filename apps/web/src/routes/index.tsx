import { isPublicSongId } from '@gekichumai/maimai-domain'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getBundledCatalogDocument } from '@/catalog/bundledCatalog'
import { loadLegacySongIds } from '@/catalog/legacySongIds'
import { resolveLegacySongId } from '@/catalog/songLookup'
import { SheetList } from '@/pages/SheetList'
import { buildSearchSeo, resolveSeoLocale } from '@/utils/seo'
import {
  buildSearchQuerySeedSheets,
  SEARCH_QUERY_MAX_LENGTH,
  type SearchQuerySeedSheet,
} from '@/components/sheet/searchQuerySeed'

type SearchParams = {
  q?: string
  songId?: string
  type?: string
  difficulty?: string
}

type SearchLoaderData = {
  seedSheets: SearchQuerySeedSheet[]
}

const searchString = (value: unknown) => {
  const stringValue =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : undefined

  if (stringValue && stringValue.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new RangeError(`Search query must not exceed ${SEARCH_QUERY_MAX_LENGTH} characters`)
  }
  return stringValue
}

export const loadSearchRouteData = ({ q }: SearchParams): SearchLoaderData => ({
  seedSheets: q ? buildSearchQuerySeedSheets(q) : [],
})

export const validateSearchParams = (search: Record<string, unknown>): SearchParams => ({
  q: searchString(search.q),
  songId: typeof search.songId === 'string' ? search.songId : undefined,
  type: typeof search.type === 'string' ? search.type : undefined,
  difficulty: typeof search.difficulty === 'string' ? search.difficulty : undefined,
})

export const Route = createFileRoute('/')({
  ssr: true,
  head: ({ match, matches }) => {
    const seo = buildSearchSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      links: seo.links,
    }
  },
  validateSearch: validateSearchParams,
  loaderDeps: ({ search }): SearchParams => ({
    q: search.q,
    songId: search.songId,
    type: search.type,
    difficulty: search.difficulty,
  }),
  loader: async ({ deps }: { deps: SearchParams }) => {
    // Chart dialog links from before public song IDs name the song by its legacy ID
    if (deps.songId && !isPublicSongId(deps.songId)) {
      const songId = resolveLegacySongId(getBundledCatalogDocument(), deps.songId, await loadLegacySongIds())
      if (songId) {
        throw redirect({ to: '/', search: (prev) => ({ ...prev, songId }), statusCode: 308, replace: true })
      }
    }
    return loadSearchRouteData(deps)
  },
  component: SearchRouteComponent,
})

function SearchRouteComponent() {
  const loaderData = Route.useLoaderData() as SearchLoaderData | undefined

  return <SheetList seedSheets={loaderData?.seedSheets ?? []} />
}