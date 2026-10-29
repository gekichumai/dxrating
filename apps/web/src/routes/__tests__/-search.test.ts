import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route } from '../search'

const redirectFromSearch = (searchStr = '', hash = '') => {
  try {
    Route.options.beforeLoad?.({ location: { searchStr, hash } } as never)
  } catch (error) {
    expect(isRedirect(error)).toBe(true)
    return error as Response & { options: { href: string; statusCode?: number } }
  }

  throw new Error('Expected the /search route to redirect')
}

describe('/search route', () => {
  it('runs during SSR so the server redirects instead of rendering an empty outlet', () => {
    expect(Route.options.ssr).not.toBe(false)
  })

  it('permanently redirects to the home page, keeping the query and hash', () => {
    const redirect = redirectFromSearch('?q=pandora&locale=ja', '#songs')

    expect(redirect.options.href).toBe('/?q=pandora&locale=ja#songs')
    expect(redirect.options.statusCode).toBe(301)
    expect(redirect.headers.get('Location')).toBe('/?q=pandora&locale=ja#songs')
  })

  it('redirects a bare /search to the home page', () => {
    expect(redirectFromSearch().headers.get('Location')).toBe('/')
  })
})