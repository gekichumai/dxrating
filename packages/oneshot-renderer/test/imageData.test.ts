import { describe, expect, it } from 'vitest'
import { imageData } from '../src/imageData.js'

describe('image bytes', () => {
  it('never includes unrelated bytes from a pooled Buffer', () => {
    const storage = Buffer.from([99, 1, 2, 3, 88])
    const view = storage.subarray(1, 4)
    const data = imageData(view)
    expect([...new Uint8Array(data)]).toEqual([1, 2, 3])
    expect(imageData(view)).toBe(data)
  })
})