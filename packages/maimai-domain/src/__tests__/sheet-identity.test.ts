import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { formatSheetIdentity, parseSheetIdentity, sameSheetIdentity } from '../sheet-identity.js'

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

  it('returns null for malformed identity strings', () => {
    expect(parseSheetIdentity('song-a/std/expert')).toBeNull()
    expect(parseSheetIdentity('song-a__dxrt__bad__dxrt__expert')).toBeNull()
    expect(parseSheetIdentity('song-a__dxrt__dx__dxrt__bad')).toBeNull()
  })

  it('compares identities by song id, type, and difficulty', () => {
    const a = { songId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    const b = { songId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    const c = { songId: 'song-a', type: TypeEnum.STD, difficulty: DifficultyEnum.Master }
    expect(sameSheetIdentity(a, b)).toBe(true)
    expect(sameSheetIdentity(a, c)).toBe(false)
  })
})