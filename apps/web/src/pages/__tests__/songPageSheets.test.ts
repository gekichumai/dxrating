import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { getVisibleSongPageSheets } from '../songPageSheets'

describe('getVisibleSongPageSheets', () => {
  it('returns only the active chart for chart detail pages', () => {
    const sheets = [
      { id: 'song-dx-basic', type: TypeEnum.DX, difficulty: DifficultyEnum.Basic },
      { id: 'song-dx-master', type: TypeEnum.DX, difficulty: DifficultyEnum.Master },
      { id: 'song-std-master', type: TypeEnum.STD, difficulty: DifficultyEnum.Master },
    ]

    expect(getVisibleSongPageSheets(sheets, TypeEnum.DX, DifficultyEnum.Basic)).toEqual([sheets[0]])
  })
})