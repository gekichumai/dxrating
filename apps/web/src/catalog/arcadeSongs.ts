// arcade-songs (https://arcade-songs.zetaraku.dev) names a song by its own song ID: the title, with a suffix for the
// few songs whose titles repeat. DXRating's song data came from arcade-songs, so these are the legacy song IDs that
// are not the song's title. A unit test keeps the list in step with the legacy song ID map.
export const ARCADE_SONGS_SONG_IDS: Readonly<Record<string, string>> = {
  dsng_cs6jtvqaga: 'Link (2)',
  dsng_qa3k5cek9f: '[協]青春コンプレックス（ヒーロー級）',
  dsng_v4hg9qf2bk: '[協]青春コンプレックス（入門編）',
  dsng_fyjygfgee2: '[宴]Wonderland Wars　オープニング (ADVANCED)',
  dsng_78vhnd2sj3: '[宴]Wonderland Wars　オープニング (BASIC)',
  dsng_wkz8nw6f3z: '[宴]Wonderland Wars　オープニング (EXPERT)',
  dsng_vgw5dcread: '[宴]Wonderland Wars　オープニング (MASTER)',
  dsng_46effhvkmh: '[宴]Wonderland Wars　オープニング (Re:MASTER)',
}

/** The song's page on arcade-songs */
export const getArcadeSongsUrl = (song: { songId: string; title: string }) =>
  `https://arcade-songs.zetaraku.dev/maimai/song/?id=${encodeURIComponent(ARCADE_SONGS_SONG_IDS[song.songId] ?? song.title)}`