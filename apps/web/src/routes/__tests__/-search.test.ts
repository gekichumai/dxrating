import { describe, expect, it, vi } from 'vitest'
import { Route, loadSearchRouteData } from '../search'
import { SEARCH_QUERY_MAX_LENGTH } from '@/components/sheet/searchQuerySeed'

vi.mock('@/pages/SheetList', () => ({
  SheetList: () => null,
}))

describe('/search route', () => {
  it('renders during SSR so direct query URLs can show seeded results', () => {
    expect(Route.options.ssr).toBe(true)
  })

  it('loads seed sheets for a prefilled query parameter', () => {
    const { seedSheets } = loadSearchRouteData({ q: '螺旋' })

    expect(seedSheets.map((sheet) => sheet.title)).toContain('ガラテアの螺旋')
    expect(seedSheets[0]?.path).toMatch(/^\/songs\//)
  })

  it('rejects oversized queries before loading search results', () => {
    const oversizedQuery = 'a'.repeat(SEARCH_QUERY_MAX_LENGTH + 1)

    expect(() => Route.options.validateSearch?.({ q: oversizedQuery } as Record<string, unknown>)).toThrow(RangeError)
    expect(() => loadSearchRouteData({ q: oversizedQuery })).toThrow(RangeError)
  })
})