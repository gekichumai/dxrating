import { CategoryEnum, DifficultyEnum, TypeEnum, type ServerEnum, type Song } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { LEGACY_SHEET_PATH_REDIRECT_STATUS_CODE, resolveLegacySheetPathRedirect } from '../$songId/$type/$difficulty'
import { LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE, resolveLegacySongRouteRedirect } from '../songs_.$songId'

const song = {
  id: 'song-1',
  version: 'maimai' as never,
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
      id: 'sheet-1',
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Basic,
      level: '1',
      internalLevelValue: 1,
      noteCounts: {},
      serverIds: ['jp', 'intl', 'usa', 'cn'] as ServerEnum[],
      isSpecial: false,
      version: 'maimai' as never,
    },
    {
      id: 'sheet-2',
      type: TypeEnum.STD,
      difficulty: DifficultyEnum.Master,
      level: '12',
      internalLevelValue: 12,
      noteCounts: {},
      serverIds: ['jp', 'intl', 'usa', 'cn'] as ServerEnum[],
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
        type: TypeEnum.STD,
        difficulty: DifficultyEnum.Master,
      },
      statusCode: 308,
    })
  })

  it('falls back to the first valid chart when a song has no master chart', () => {
    const utageOnlySong = {
      ...song,
      id: 'dsng_breakbreak',
      sheets: [
        {
          ...song.sheets[0],
          type: TypeEnum.UTAGE,
          difficulty: '【光】' as DifficultyEnum,
        },
      ],
    } satisfies Song

    expect(resolveLegacySongRouteRedirect(utageOnlySong)).toMatchObject({
      params: {
        songId: 'dsng_breakbreak',
        type: TypeEnum.UTAGE,
        difficulty: '【光】',
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