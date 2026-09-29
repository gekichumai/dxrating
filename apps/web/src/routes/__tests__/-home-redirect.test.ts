import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route } from '../index'

const redirectFromHome = (searchStr = '', hash = ''): Response => {
  try {
    if (Route.options.beforeLoad === undefined) throw new Error('Missing beforeLoad')
    Reflect.apply(Route.options.beforeLoad, undefined, [{ location: { searchStr, hash } }])
  } catch (error) {
    if (!(error instanceof Response)) throw error
    return error
  }

  throw new Error('Expected home route to redirect')
}

describe('home route redirect', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects to search while preserving the incoming query and hash', () => {
    const redirect = redirectFromHome('?from=home', '#saved')

    expect(redirect.headers.get('Location')).toBe('/search?from=home#saved')
  })

  it('does not read obsolete saved tab state from localStorage', () => {
    const getItem = vi.fn(() => JSON.stringify('rating'))
    vi.stubGlobal('localStorage', { getItem })

    const redirect = redirectFromHome()

    expect(redirect.headers.get('Location')).toBe('/search')
    expect(getItem).not.toHaveBeenCalled()
  })
})