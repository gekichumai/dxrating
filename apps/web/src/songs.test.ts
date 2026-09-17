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
describe('artist and chart designer search', () => {
  const baseSong = getSongs()[0]!
  const baseSheet = getFlattenedSheetsForVersion(VersionEnum.CiRCLEPLUS)[0]!
  const song = {
    ...baseSong,
    songId: 'credits-song',
    title: 'Moonlight',
    artist: 'Café Ensemble',
    searchAcronyms: ['lunar alias'],
  }
  const sheets = [
    {
      ...baseSheet,
      id: 'credits-master',
      songId: song.songId,
      title: song.title,
      artist: song.artist,
      noteDesigner: 'Unique Designer',
      internalId: 987654,
    },
    {
      ...baseSheet,
      id: 'credits-basic',
      songId: song.songId,
      title: song.title,
      artist: song.artist,
      noteDesigner: 'Another Mapper',
      internalId: 987654,
    },
    {
      ...baseSheet,
      id: 'credits-unknown',
      songId: song.songId,
      title: song.title,
      artist: song.artist,
      noteDesigner: null,
      internalId: 987654,
    },
  ]
  const search = createSheetsSearchEngine({ songs: [song], sheets })

  it('finds all charts by normalized artist, including partial matches', () => {
    expect(search('ＣＡＦＥ').map((s) => s.id)).toEqual(sheets.map((s) => s.id))
    expect(search('ensemble').map((s) => s.id)).toEqual(sheets.map((s) => s.id))
  })

  it('matches only the credited chart and combines fields', () => {
    for (const query of ['unique designer', 'cafe unique', 'Moonlight designer', 'lunar\tunique']) {
      expect(search(query).map((s) => s.id)).toEqual(['credits-master'])
    }
    expect(search('ensemble nonexistent')).toEqual([])
  })

  it('preserves aliases, titles, exact IDs, and deduplication', () => {
    for (const query of ['Moonlight', 'lunar alias', '987654']) {
      expect(search(query).map((s) => s.id)).toEqual(sheets.map((s) => s.id))
    }
    expect(search('   ')).toEqual([])
  })
})