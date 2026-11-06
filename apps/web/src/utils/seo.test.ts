import { describe, expect, it } from 'vitest'
import { buildNotFoundSeoMeta, resolveRootHeadState } from './seo'

const root = { routeId: '__root__', status: 'success' }
const notFoundRoot = { ...root, globalNotFound: true }

describe('resolveRootHeadState', () => {
  it('treats an unmatched URL as a 404', () => {
    expect(resolveRootHeadState(notFoundRoot, [notFoundRoot])).toEqual({ isNotFound: true, includeRootTitle: false })
  })

  // A loader's notFound() updates the finalized root match only; `matches` is the array from before loading
  it('treats a loader-thrown notFound() as a 404 from the root match alone', () => {
    const matches = [root, { routeId: '/constants/$level', status: 'pending' }]
    expect(resolveRootHeadState(notFoundRoot, matches)).toEqual({ isNotFound: true, includeRootTitle: false })
  })

  it('gives a missing song the 404 metadata although song routes own the title of a rendered page', () => {
    for (const routeId of ['/songs_/$songId', '/songs/$songId/$type/$difficulty']) {
      const matches = [root, { routeId, status: 'pending' }]
      expect(resolveRootHeadState(notFoundRoot, matches)).toEqual({ isNotFound: true, includeRootTitle: false })
    }
  })

  it('leaves the title to a song page that rendered', () => {
    const matches = [root, { routeId: '/songs_/$songId', status: 'success' }]
    expect(resolveRootHeadState(root, matches)).toEqual({ isNotFound: false, includeRootTitle: false })
  })

  it('gives any other successful page the root title and no 404 state', () => {
    const matches = [root, { routeId: '/rating', status: 'success' }]
    expect(resolveRootHeadState(root, matches)).toEqual({ isNotFound: false, includeRootTitle: true })
  })
})

describe('buildNotFoundSeoMeta', () => {
  it('emits the localised not-found title and noindex', () => {
    expect(buildNotFoundSeoMeta('ja')).toEqual([
      { title: 'ページが見つかりません - DXRating' },
      { name: 'robots', content: 'noindex' },
    ])
    expect(buildNotFoundSeoMeta('en')[0]).toEqual({ title: 'Page not found - DXRating' })
  })
})