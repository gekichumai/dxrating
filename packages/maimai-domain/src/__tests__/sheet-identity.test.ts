import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  formatLegacySheetId,
  isPublicSheetId,
  isPublicSongId,
  parseLegacySheetId,
  sameSheetIdentity,
} from '../sheet-identity'
import type { LegacySheetIdentity, SheetIdentity } from '../types'

function assertSheetIdentityTypes(): void {
  const standard: SheetIdentity = {
    songId: 'std-song',
    type: TypeEnum.STD,
    difficulty: DifficultyEnum.Basic,
  }
  const utage: SheetIdentity = {
    songId: 'utage-song',
    type: TypeEnum.UTAGE,
    difficulty: '【協】',
  }
  // @ts-expect-error DX identities must not accept UTAGE custom difficulty labels.
  const invalidDx: SheetIdentity = {
    songId: 'dx-song',
    type: TypeEnum.DX,
    difficulty: '【協】',
  }

  void standard
  void utage
  void invalidDx
}

void assertSheetIdentityTypes

describe('Sheet Identity', () => {
  it('recognizes public song and sheet IDs', () => {
    expect(isPublicSongId('dsng_kkx38yfx4t')).toBe(true)
    expect(isPublicSheetId('dsht_2bk5ptsbwy')).toBe(true)
    expect(isPublicSheetId('dsng_kkx38yfx4t')).toBe(false)
    // the public alphabet has no 0, 1, i, l, o or u
    expect(isPublicSheetId('dsht_2bk5ptsbw0')).toBe(false)
    expect(isPublicSheetId('君の知らない物語__dxrt__dx__dxrt__master')).toBe(false)
  })

  it('formats legacy sheet IDs with the DXRating separator', () => {
    expect(
      formatLegacySheetId({
        legacySongId: '君の知らない物語',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBe('君の知らない物語__dxrt__dx__dxrt__master')
  })

  it('parses a legacy sheet ID back into parts', () => {
    expect(parseLegacySheetId('song-a__dxrt__std__dxrt__expert')).toEqual({
      legacySongId: 'song-a',
      type: TypeEnum.STD,
      difficulty: DifficultyEnum.Expert,
    })
  })

  it('round-trips UTAGE legacy sheet IDs with custom difficulty labels', () => {
    const identity: LegacySheetIdentity = {
      legacySongId: 'utage-song',
      type: TypeEnum.UTAGE,
      difficulty: '【協】',
    }

    expect(parseLegacySheetId(formatLegacySheetId(identity))).toEqual(identity)
    expect(parseLegacySheetId('utage-2p-song__dxrt__utage2p__dxrt__【奏】')).toEqual({
      legacySongId: 'utage-2p-song',
      type: TypeEnum.UTAGE2P,
      difficulty: '【奏】',
    })
  })

  it('returns null for malformed legacy sheet IDs', () => {
    expect(parseLegacySheetId('song-a/std/expert')).toBeNull()
    expect(parseLegacySheetId('song-a__dxrt__bad__dxrt__expert')).toBeNull()
    expect(parseLegacySheetId('song-a__dxrt__dx__dxrt__bad')).toBeNull()
    expect(parseLegacySheetId('song-a__dxrt__dx__dxrt__【協】')).toBeNull()
    expect(parseLegacySheetId('dsht_2bk5ptsbwy')).toBeNull()
  })

  it('compares identities by song id, type, and difficulty', () => {
    const a = { songId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    const b = { songId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    const c = { songId: 'song-a', type: TypeEnum.STD, difficulty: DifficultyEnum.Master }
    expect(sameSheetIdentity(a, b)).toBe(true)
    expect(sameSheetIdentity(a, c)).toBe(false)
  })
})