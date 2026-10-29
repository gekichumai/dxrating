import { LEGACY_SONG_IDS } from '@gekichumai/dxdata/legacy-song-ids'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import { ARCADE_SONGS_SONG_IDS, getArcadeSongsUrl } from '../arcadeSongs'

describe('arcade-songs links', () => {
  it('names songs by their arcade-songs song ID, which tells apart songs that share a title', () => {
    expect(getArcadeSongsUrl({ songId: 'dsng_hfz8w7y42r', title: 'Link' })).toBe(
      'https://arcade-songs.zetaraku.dev/maimai/song/?id=Link',
    )
    expect(getArcadeSongsUrl({ songId: 'dsng_cs6jtvqaga', title: 'Link' })).toBe(
      'https://arcade-songs.zetaraku.dev/maimai/song/?id=Link%20(2)',
    )
  })

  it('lists every legacy song ID that is not the title of its song', () => {
    const titles = new Map(catalogSnapshot.songs.map((song) => [song.id, song.title]))
    const expected = Object.fromEntries(
      Object.entries(LEGACY_SONG_IDS)
        .filter(([legacyId, songId]) => titles.has(songId) && titles.get(songId) !== legacyId)
        .map(([legacyId, songId]) => [songId, legacyId]),
    )

    expect(ARCADE_SONGS_SONG_IDS).toEqual(expected)
  })
})