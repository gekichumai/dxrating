import { describe, expect, it } from 'vitest'
import { createScrollPositions } from '../ScrollRestorationKeeper'

const entry = (key: string, hash = '') => ({ hash, state: { __TSR_key: key } })

describe('createScrollPositions', () => {
  it('returns the position an entry was left at when it is revisited', () => {
    const positions = createScrollPositions()
    positions.leave(entry('home'), 6000)
    expect(positions.revisit(entry('home'))).toBe(6000)
  })

  it('has nothing for a new entry, so a pushed page starts at the top', () => {
    const positions = createScrollPositions()
    positions.leave(entry('home'), 6000)
    expect(positions.revisit(entry('new-home'))).toBeUndefined()
  })

  it('leaves the top and hash targets to the router', () => {
    const positions = createScrollPositions()
    positions.leave(entry('top'), 0)
    positions.leave(entry('anchor'), 900)
    expect(positions.revisit(entry('top'))).toBeUndefined()
    expect(positions.revisit(entry('anchor', 'section'))).toBeUndefined()
  })
})