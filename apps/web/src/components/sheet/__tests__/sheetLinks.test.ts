import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { buildSheetLink } from '../sheetLinks'

describe('buildSheetLink', () => {
  it('builds an absolute sheet link with song, type, and difficulty params', () => {
    expect(
      buildSheetLink(
        {
          songId: 'song 100%',
          type: TypeEnum.DX,
          difficulty: DifficultyEnum.Master,
        },
        'https://dxrating.net',
      ),
    ).toBe('https://dxrating.net/songs/song%20100%25/dx/master')
  })
})