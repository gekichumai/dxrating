import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from '../index'

const redirectFromHome = (searchStr = '', hash = ''): Response => {
  try {
    Route.options.beforeLoad?.({ location: { searchStr, hash } } as never)
  } catch (error) {
    return error as Response
  }

  throw new Error('Expected home route to redirect')
}

describe('home route redirect', () => {
  let storage: Map<string, string>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    })
  })

  it.each([
    ['recent', '/charts/recent?from=home#saved'],
    ['trending', '/charts/trending?from=home#saved'],
    ['search', '/search?from=home#saved'],
    ['rating', '/rating?from=home#saved'],
  ])('redirects to the saved %s app tab', (savedTab, expectedHref) => {
    localStorage.setItem('tab-selection', JSON.stringify(savedTab))

    const redirect = redirectFromHome('?from=home', '#saved')

    expect(redirect.headers.get('Location')).toBe(expectedHref)
  })

  it('falls back to search when the saved tab is unknown', () => {
    localStorage.setItem('tab-selection', JSON.stringify('unknown'))

    const redirect = redirectFromHome()

    expect(redirect.headers.get('Location')).toBe('/search')
  })
})