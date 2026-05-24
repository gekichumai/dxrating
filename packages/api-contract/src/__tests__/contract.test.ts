import { describe, expect, it } from 'vitest'
import { publicAppContract, LxnsStartOutputSchema } from '../contract.js'

describe('publicAppContract', () => {
  it('exposes browser-callable routes without backend-only routes', () => {
    expect(Object.keys(publicAppContract)).toEqual(['tags', 'comments', 'aliases', 'analytics', 'lxns'])
    expect('maimai' in publicAppContract).toBe(false)
    expect('chartOgImage' in publicAppContract).toBe(false)
    expect('monitoring' in publicAppContract).toBe(false)
  })

  it('owns shared route payload schemas', () => {
    expect(
      LxnsStartOutputSchema.parse({
        scores: [
          {
            id: 1,
            songName: 'Test Song',
            level: '14+',
            levelIndex: 3,
            achievements: 100.5,
            fc: null,
            fs: 'fs',
            type: 'dx',
          },
        ],
        count: 1,
      }),
    ).toEqual({
      scores: [
        {
          id: 1,
          songName: 'Test Song',
          level: '14+',
          levelIndex: 3,
          achievements: 100.5,
          fc: null,
          fs: 'fs',
          type: 'dx',
        },
      ],
      count: 1,
    })
  })
})