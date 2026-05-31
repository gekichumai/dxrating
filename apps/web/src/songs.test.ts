import { VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  createSheetsSearchEngine,
  getFlattenedSheetsForVersion,
  getSearchAcronymsWithServerAliases,
  getSongs,
} from './songs'

describe('getSearchAcronymsWithServerAliases', () => {
  it('merges generated aliases with server aliases for the current song', () => {
    expect(
      getSearchAcronymsWithServerAliases(
        {
          songId: 'song-1',
          searchAcronyms: ['generated alias', 'shared alias'],
        },
        [
          { song_id: 'song-1', name: 'server alias' },
          { song_id: 'song-1', name: 'shared alias' },
          { song_id: 'song-2', name: 'other song alias' },
        ],
      ),
    ).toEqual(['generated alias', 'shared alias', 'server alias'])
  })

  it('finds Japanese title matches for a prefilled URL query', () => {
    const search = createSheetsSearchEngine({
      songs: getSongs(),
      sheets: getFlattenedSheetsForVersion(VersionEnum.CiRCLEPLUS),
    })

    expect(search('螺旋').map((sheet) => sheet.title)).toContain('ガラテアの螺旋')
  })
})