import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route } from '../index'

describe('index route', () => {
  it('runs during SSR so the server redirects instead of rendering an empty outlet', () => {
    expect(Route.options.ssr).not.toBe(false)
  })

  it('redirects root visits to search while preserving the URL suffix', () => {
    try {
      Route.options.beforeLoad?.({
        location: {
          searchStr: '?locale=ja',
          hash: '#songs',
        },
      } as never)
    } catch (error) {
      expect(isRedirect(error)).toBe(true)
      expect(error).toMatchObject({
        options: {
          href: '/search?locale=ja#songs',
        },
      })
      return
    }

    throw new Error('Expected the index route to redirect')
  })
})
