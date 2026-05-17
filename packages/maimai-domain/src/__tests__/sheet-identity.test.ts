import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { formatSheetIdentity, parseSheetIdentity, sameSheetIdentity } from '../sheet-identity.js'
import type { SheetIdentity } from '../types.js'

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
  it('formats identity with the existing DXRating separator', () => {
    expect(
      formatSheetIdentity({
        songId: '君の知らない物語',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBe('君の知らない物語__dxrt__dx__dxrt__master')
  })

  it('parses a formatted identity back into parts', () => {
    expect(parseSheetIdentity('song-a__dxrt__std__dxrt__expert')).toEqual({
      songId: 'song-a',
      type: TypeEnum.STD,
      difficulty: DifficultyEnum.Expert,
    })
  })

  it('round-trips UTAGE identities with custom difficulty labels', () => {
    const identity: SheetIdentity = {
      songId: 'utage-song',
      type: TypeEnum.UTAGE,
      difficulty: '【協】',
    }

    expect(parseSheetIdentity(formatSheetIdentity(identity))).toEqual(identity)
    expect(parseSheetIdentity('utage-2p-song__dxrt__utage2p__dxrt__【奏】')).toEqual({
      songId: 'utage-2p-song',
      type: TypeEnum.UTAGE2P,
      difficulty: '【奏】',
    })
  })

  it('returns null for malformed identity strings', () => {
    expect(parseSheetIdentity('song-a/std/expert')).toBeNull()
    expect(parseSheetIdentity('song-a__dxrt__bad__dxrt__expert')).toBeNull()
    expect(parseSheetIdentity('song-a__dxrt__dx__dxrt__bad')).toBeNull()
    expect(parseSheetIdentity('song-a__dxrt__dx__dxrt__【協】')).toBeNull()
  })

  it('compares identities by song id, type, and difficulty', () => {
    const a = { songId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    const b = { songId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    const c = { songId: 'song-a', type: TypeEnum.STD, difficulty: DifficultyEnum.Master }
    expect(sameSheetIdentity(a, b)).toBe(true)
    expect(sameSheetIdentity(a, c)).toBe(false)
  })
})