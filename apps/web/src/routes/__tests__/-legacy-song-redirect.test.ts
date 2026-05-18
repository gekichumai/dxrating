import { CategoryEnum, DifficultyEnum, TypeEnum, type Song } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { LEGACY_SHEET_PATH_REDIRECT_STATUS_CODE, resolveLegacySheetPathRedirect } from '../$songId/$type/$difficulty'
import { LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE, resolveLegacySongRouteRedirect } from '../songs_.$songId'

const song = {
  songId: 'song-1',
  searchAcronyms: [],
  category: CategoryEnum.Maimai,
  title: 'Song 1',
  artist: 'Artist',
  bpm: 120,
  imageName: 'song-1',
  isNew: false,
  isLocked: false,
  sheets: [
    {
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Basic,
      level: '1',
      internalLevelValue: 1,
      noteDesigner: null,
      noteCounts: { tap: null, hold: null, slide: null, touch: null, break: null, total: null },
      regions: { jp: true, intl: true, cn: true },
      isSpecial: false,
      version: 'maimai' as never,
    },
    {
      type: TypeEnum.STD,
      difficulty: DifficultyEnum.Master,
      level: '12',
      internalLevelValue: 12,
      noteDesigner: null,
      noteCounts: { tap: null, hold: null, slide: null, touch: null, break: null, total: null },
      regions: { jp: true, intl: true, cn: true },
      isSpecial: false,
      version: 'maimai' as never,
    },
  ],
} satisfies Song

describe('resolveLegacySongRouteRedirect', () => {
  it('permanently redirects old query URLs to the matching path route', () => {
    expect(resolveLegacySongRouteRedirect(song, TypeEnum.STD, DifficultyEnum.Master)).toEqual({
      to: '/songs/$songId/$type/$difficulty',
      params: {
        songId: 'song-1',
        type: TypeEnum.STD,
        difficulty: DifficultyEnum.Master,
      },
      statusCode: LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE,
      replace: true,
    })
    expect(LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE).toBe(308)
  })

  it('falls back to a valid chart when the legacy query is incomplete', () => {
    expect(resolveLegacySongRouteRedirect(song)).toMatchObject({
      params: {
        songId: 'song-1',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Basic,
      },
      statusCode: 308,
    })
  })
})

describe('resolveLegacySheetPathRedirect', () => {
  it('permanently redirects old root-level sheet URLs to the songs route', () => {
    expect(resolveLegacySheetPathRedirect('song-1', TypeEnum.STD, DifficultyEnum.Master)).toEqual({
      to: '/songs/$songId/$type/$difficulty',
      params: {
        songId: 'song-1',
        type: TypeEnum.STD,
        difficulty: DifficultyEnum.Master,
      },
      statusCode: LEGACY_SHEET_PATH_REDIRECT_STATUS_CODE,
      replace: true,
    })
    expect(LEGACY_SHEET_PATH_REDIRECT_STATUS_CODE).toBe(308)
  })
})