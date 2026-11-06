import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordNavigationOrigin, resetNavigationOrigins, useNavigationOrigin } from '../navigationOrigins'

let currentKey = 'home-entry'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ subscribe: () => () => {} }),
  useRouterState: ({ select }: { select: (state: { location: unknown }) => unknown }) =>
    select({ location: { pathname: '/', state: { __TSR_key: currentKey } } }),
}))

const at = (pathname: string, key: string, index: number) => ({
  pathname,
  state: { __TSR_key: key, __TSR_index: index },
})

const originOf = (key: string) => {
  currentKey = key
  return renderHook(() => useNavigationOrigin()).result.current
}

describe('navigation origins', () => {
  beforeEach(() => {
    resetNavigationOrigins()
  })

  it('remembers the page each new entry was reached from', () => {
    recordNavigationOrigin(at('/', 'a', 0), at('/charts/recent', 'b', 1))
    expect(originOf('b')).toBe('/')
  })

  it('keeps that origin when Back or Forward revisits the entry', () => {
    recordNavigationOrigin(at('/', 'a', 0), at('/charts/recent', 'b', 1))
    recordNavigationOrigin(at('/charts/recent', 'b', 1), at('/songs/x', 'c', 2))
    // Back from the song page lands on entry b again
    recordNavigationOrigin(at('/songs/x', 'c', 2), at('/charts/recent', 'b', 1))
    expect(originOf('b')).toBe('/')
    expect(originOf('c')).toBe('/charts/recent')
  })

  it('carries the origin over a navigation within the same page', () => {
    recordNavigationOrigin(at('/', 'a', 0), at('/charts/recent', 'b', 1))
    recordNavigationOrigin(at('/charts/recent', 'b', 1), at('/charts/recent', 'b2', 1))
    expect(originOf('b2')).toBe('/')
  })

  it('knows nothing of a page opened directly (first load)', () => {
    recordNavigationOrigin(undefined, at('/charts/recent', 'b', 1))
    expect(originOf('b')).toBeUndefined()
  })

  it('records nothing for an old entry revisited after a reload (Back is not a push)', () => {
    // Rating (0) → New charts (1); reload New charts; navigate Home (2); Back to the old New charts entry (1)
    recordNavigationOrigin(at('/charts/recent', 'b', 1), at('/', 'c', 2))
    recordNavigationOrigin(at('/', 'c', 2), at('/charts/recent', 'b', 1))
    expect(originOf('b')).toBeUndefined()
  })

  it('records Forward onto an entry, whose predecessor is the entry it left', () => {
    recordNavigationOrigin(at('/', 'a', 0), at('/charts/recent', 'b', 1))
    expect(originOf('b')).toBe('/')
  })

  it('records nothing for a jump of several entries', () => {
    recordNavigationOrigin(at('/', 'a', 0), at('/charts/recent', 'd', 3))
    expect(originOf('d')).toBeUndefined()
  })
})