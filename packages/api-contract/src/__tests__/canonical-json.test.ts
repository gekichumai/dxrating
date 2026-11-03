import { describe, expect, it } from 'vitest'
import { CANONICAL_MAX_DEPTH, canonicalJson } from '../canonical-json.ts'

describe('canonicalJson', () => {
  it('sorts object keys recursively and keeps arrays in their order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    )
    expect(canonicalJson([{ b: 1 }, { a: 2 }])).toBe('[{"b":1},{"a":2}]')
  })

  it('keeps nulls, leaves out undefined properties, and keeps unicode as is', () => {
    expect(canonicalJson({ a: null, b: undefined, c: '譜面-🎵-é' })).toBe('{"a":null,"c":"譜面-🎵-é"}')
  })

  it('throws instead of recursing past the depth guard', () => {
    let value: unknown = 1
    for (let depth = 0; depth <= CANONICAL_MAX_DEPTH; depth++) value = [value]
    expect(() => canonicalJson(value)).toThrow(RangeError)
  })
})