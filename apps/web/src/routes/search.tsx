import { createFileRoute } from '@tanstack/react-router'
import { SheetList } from '@/pages/SheetList'
import { buildSearchSeo, resolveSeoLocale } from '@/utils/seo'
import { buildSearchQuerySeedSheets, type SearchQuerySeedSheet } from '@/components/sheet/searchQuerySeed'

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
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

export const loadSearchRouteData = ({ q }: SearchParams): SearchLoaderData => ({
  seedSheets: q ? buildSearchQuerySeedSheets(q) : [],
})

export const Route = createFileRoute('/search')({
  ssr: true,
  head: ({ match, matches }) => {
    const seo = buildSearchSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      links: seo.links,
    }
  },
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: searchString(search.q),
    songId: typeof search.songId === 'string' ? search.songId : undefined,
    type: typeof search.type === 'string' ? search.type : undefined,
    difficulty: typeof search.difficulty === 'string' ? search.difficulty : undefined,
  }),
  loaderDeps: ({ search }): SearchParams => ({
    q: search.q,
    songId: search.songId,
    type: search.type,
    difficulty: search.difficulty,
  }),
  loader: ({ deps }) => loadSearchRouteData(deps),
  component: SearchRouteComponent,
})

function SearchRouteComponent() {
  const loaderData = Route.useLoaderData() as SearchLoaderData | undefined

  return <SheetList seedSheets={loaderData?.seedSheets ?? []} />
}