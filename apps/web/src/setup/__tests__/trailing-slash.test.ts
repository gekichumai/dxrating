import { describe, expect, it } from 'vitest'
import { trailingSlashRedirect } from '../trailing-slash'

const redirectOf = (url: string, method = 'GET') => trailingSlashRedirect(new Request(url, { method }))

describe('trailingSlashRedirect', () => {
  it('permanently redirects a trailing slash to the bare path, keeping the query', () => {
    const response = redirectOf('https://dxrating.net/rating/?locale=ja')
    expect(response?.status).toBe(308)
    expect(response?.headers.get('Location')).toBe('/rating?locale=ja')
    expect(redirectOf('https://dxrating.net/songs/dsng_x/dx/master//')?.headers.get('Location')).toBe(
      '/songs/dsng_x/dx/master',
    )
  })

  it('leaves the home page, slash-less paths and non-GET requests alone', () => {
    expect(redirectOf('https://dxrating.net/')).toBeNull()
    expect(redirectOf('https://dxrating.net/rating')).toBeNull()
    expect(redirectOf('https://dxrating.net/rating/', 'POST')).toBeNull()
  })
})