import { describe, expect, it } from 'vitest'
import {
  ArcadeInstallationIdSchema,
  ArcadeVenueDetailInputSchema,
  ArcadeVenueIdSchema,
  publicAppContract,
  LxnsStartOutputSchema,
} from '../contract.js'

describe('publicAppContract', () => {
  it('exposes browser-callable routes without backend-only routes', () => {
    expect(Object.keys(publicAppContract)).toEqual(['tags', 'comments', 'aliases', 'analytics', 'arcades', 'lxns'])
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

  it('accepts only typed public arcade record identifiers', () => {
    expect(ArcadeVenueIdSchema.parse('dven_23456789ab')).toBe('dven_23456789ab')
    expect(ArcadeInstallationIdSchema.parse('dins_cdefghjkmn')).toBe('dins_cdefghjkmn')
    expect(ArcadeVenueDetailInputSchema.parse({ id: 'dven_pqrstvwxyz' })).toEqual({ id: 'dven_pqrstvwxyz' })

    for (const invalid of ['123', 'dven_1234567890', 'dven_23456789ai', 'venue_23456789ab']) {
      expect(ArcadeVenueIdSchema.safeParse(invalid).success).toBe(false)
    }
    for (const invalid of ['501', 'dins_1234567890', 'dins_23456789ao', 'installation_23456789ab']) {
      expect(ArcadeInstallationIdSchema.safeParse(invalid).success).toBe(false)
    }
  })
})