import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordNavigationOrigin, resetNavigationOrigins, useNavigationOrigin } from '../navigationOrigins'

let currentKey = 'home-entry'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ subscribe: () => () => {} }),
  useRouterState: ({ select }: { select: (state: { location: unknown }) => unknown }) =>
    select({ location: { pathname: '/', state: { __TSR_key: currentKey } } }),
}))

const at = (pathname: string, key: string) => ({ pathname, state: { __TSR_key: key } })

const originOf = (key: string) => {
  currentKey = key
  return renderHook(() => useNavigationOrigin()).result.current
}

describe('navigation origins', () => {
  beforeEach(() => {
    resetNavigationOrigins()
  })

  it('remembers the page each new entry was reached from', () => {
    recordNavigationOrigin(at('/', 'a'), at('/charts/recent', 'b'))
    expect(originOf('b')).toBe('/')
  })

  it('keeps that origin when Back or Forward revisits the entry', () => {
    recordNavigationOrigin(at('/', 'a'), at('/charts/recent', 'b'))
    recordNavigationOrigin(at('/charts/recent', 'b'), at('/songs/x', 'c'))
    // Back from the song page lands on entry b again
    recordNavigationOrigin(at('/songs/x', 'c'), at('/charts/recent', 'b'))
    expect(originOf('b')).toBe('/')
    expect(originOf('c')).toBe('/charts/recent')
  })

  it('carries the origin over a navigation within the same page', () => {
    recordNavigationOrigin(at('/', 'a'), at('/charts/recent', 'b'))
    recordNavigationOrigin(at('/charts/recent', 'b'), at('/charts/recent', 'b2'))
    expect(originOf('b2')).toBe('/')
  })

  it('knows nothing of a page opened directly (first load)', () => {
    recordNavigationOrigin(undefined, at('/charts/recent', 'b'))
    expect(originOf('b')).toBeUndefined()
  })
})