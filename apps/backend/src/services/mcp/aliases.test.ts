import { describe, expect, it } from 'vitest'
import { buildMcpCatalog, searchSongs, type PublishedCatalog } from './catalog'
import { runSearchSongs } from './tool-search-songs'
import { publishedCatalog } from './test-fixture'

// Community aliases come from two places in the published catalog: searchAcronyms, which the producer imports from
// LXNS, yuzuchan, GCM-bot and its local list, and aliases, which users add on the site. Both are aliases to search.

const PANDORA = 'dsng_pnd2345678'
const BBB = 'dsng_bbb2345678'
const sheet = (id: string) => ({
  id,
  type: 'dx',
  difficulty: 'master',
  level: '14+',
  internalLevelValue: 14.9,
  noteCounts: {},
  serverIds: ['jp', 'intl', 'usa', 'cn'],
  isSpecial: false,
  version: 'PRiSM',
})
const base = publishedCatalog.songs[0]
const data: PublishedCatalog = {
  ...publishedCatalog,
  songs: [
    ...publishedCatalog.songs,
    {
      ...base,
      id: PANDORA,
      title: 'PANDORA PARADOXXX',
      artist: 'Sakuzyo',
      // LXNS (Chinese) and GCM-bot (English) nicknames
      searchAcronyms: ['潘', '潘多拉', 'pandora'],
      sheets: [sheet('dsht_pnd2345678')],
    },
    {
      ...base,
      id: BBB,
      title: 'BREaK! BREaK! BREaK!',
      artist: 'HiTECH NINJA vs Cranky',
      searchAcronyms: ['bbb', 'ブレブレブレ'],
      sheets: [sheet('dsht_bbb2345678')],
    },
  ],
  // added by users on the site
  aliases: [...publishedCatalog.aliases, { song_id: PANDORA, name: 'パンパラ' }],
}
const catalog = buildMcpCatalog('1', data)
const first = (query: string) => searchSongs(catalog, query)[0]

describe('search by alias', () => {
  it('finds Chinese, Japanese and English nicknames, as aliases', () => {
    for (const [query, id, text] of [
      ['潘', PANDORA, '潘'],
      ['潘多拉', PANDORA, '潘多拉'],
      ['bbb', BBB, 'bbb'],
      ['BBB', BBB, 'bbb'],
      ['ぶれぶれぶれ', BBB, 'ブレブレブレ'],
      ['パンパラ', PANDORA, 'パンパラ'],
    ]) {
      const match = first(query)
      expect(match?.entry.song.id, query).toBe(id)
      expect(match?.matched, query).toEqual({ kind: 'alias', text })
    }
  })

  it('reports kind alias in search_songs, never acronym', () => {
    const result = runSearchSongs(catalog, { query: '潘' }).structuredContent as {
      songs: { songId: string; matched: { kind: string } }[]
    }
    expect(result.songs[0]).toMatchObject({ songId: PANDORA, matched: { kind: 'alias' } })
    for (const query of ['umiyuri', 'bbb', '潘多拉']) {
      for (const match of searchSongs(catalog, query)) expect(match.matched.kind).not.toBe('acronym')
    }
  })

  it('still ranks a title over an alias', () => {
    expect(first('pandora paradoxxx')?.matched).toEqual({ kind: 'title', text: 'PANDORA PARADOXXX' })
  })
})