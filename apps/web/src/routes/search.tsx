import { createFileRoute } from '@tanstack/react-router'
import { SheetList } from '@/pages/SheetList'
import { buildSearchSeo, resolveSeoLocale } from '@/utils/seo'

type SearchParams = {
  q?: string
  songId?: string
  type?: string
  difficulty?: string
}

export const Route = createFileRoute('/search')({
  ssr: false,
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
  component: SheetList,
})