import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { SheetList } from '@/pages/SheetList'
import { buildSearchSeo, resolveSeoLocale } from '@/utils/seo'
import {
  buildSearchSeedSheets,
  hasActiveFilterLastActiveAtCookie,
  shouldShowSearchSeed,
  type SearchSeedSheet,
} from '@/components/sheet/searchSeed'

type SearchParams = {
  q?: string
  songId?: string
  type?: string
  difficulty?: string
}

type SearchLoaderData = {
  seedSheets: SearchSeedSheet[]
}

const getHasActiveSearchSeedFilter = createServerFn({ method: 'GET' }).handler(() =>
  hasActiveFilterLastActiveAtCookie(getRequestHeader('cookie') ?? null),
)

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
    q: typeof search.q === 'string' ? search.q : undefined,
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
  loader: async ({ deps }): Promise<SearchLoaderData> => {
    const search = deps as SearchParams

    if (search.q || search.songId || search.type || search.difficulty) {
      return { seedSheets: [] }
    }

    const hasActiveSearchSeedFilter = await getHasActiveSearchSeedFilter()
    return {
      seedSheets: shouldShowSearchSeed(search, hasActiveSearchSeedFilter) ? buildSearchSeedSheets() : [],
    }
  },
  component: SheetList,
})