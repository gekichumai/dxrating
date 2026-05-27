import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState } from 'react'
import { buildSearchSeo, resolveSeoLocale } from '@/utils/seo'

const SheetList = lazy(() => import('@/pages/SheetList').then((module) => ({ default: module.SheetList })))

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
  component: SearchRouteComponent,
})

function SearchRouteComponent() {
  const [showList, setShowList] = useState(false)

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 700))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = schedule(() => setShowList(true), { timeout: 1800 })

    return () => cancel(id)
  }, [])

  if (!showList) return <SearchRouteFallback />

  return (
    <Suspense fallback={<SearchRouteFallback />}>
      <SheetList />
    </Suspense>
  )
}

function SearchRouteFallback() {
  return (
    <div className="flex-container pb-global">
      <div className="h-14 w-full rounded bg-white/35 animate-pulse" />
      <div className="h-10 w-40 rounded-full bg-blue-200/60 animate-pulse" />
      <div className="flex flex-col w-full">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            className="flex items-center justify-start gap-4 w-full h-[78px] px-5 py-2"
            // oxlint-disable-next-line react/no-array-index-key -- placeholder count is fixed
            key={index}
          >
            <div className="h-12 w-12 min-w-[3rem] min-h-[3rem] rounded bg-slate-6/30 animate-pulse" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="bg-slate-5/30 h-5 w-40 max-w-full animate-pulse">&nbsp;</div>
              <div className="w-24 bg-slate-3/30 h-3 animate-pulse">&nbsp;</div>
            </div>
            <div className="w-10 bg-slate-5/30 h-6 animate-pulse">&nbsp;</div>
          </div>
        ))}
      </div>
    </div>
  )
}
