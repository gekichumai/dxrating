import { describe, expect, it } from 'vitest'
import { Route } from '../search'

describe('/search route', () => {
  it('runs during SSR so the first HTML includes the search-page skeleton', () => {
    expect(Route.options.ssr).not.toBe(false)
  })
})