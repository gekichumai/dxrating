import type { z } from 'zod'
import type { PublishedDxdataCatalogSchema } from '../dxdata-openapi'

// The in-memory catalog the MCP tools read: the published DX data catalog with indexes by ID and a search index of
// the names users and models call songs by. It is built once per publication (see loader.ts), so no tool call
// reaches the database.

export type PublishedCatalog = z.infer<typeof PublishedDxdataCatalogSchema>
export type PublishedSong = PublishedCatalog['songs'][number]
export type PublishedSheet = PublishedSong['sheets'][number]
export type PublishedTag = PublishedCatalog['tags'][number]
export type PublishedTagGroup = PublishedCatalog['tagGroups'][number]

/** What a name of a song is: its title, a search acronym of the catalog, a community alias, or its artist. */
export type NameKind = 'title' | 'acronym' | 'alias' | 'artist'

interface SongName {
  kind: NameKind
  text: string
  key: string
}

export interface CatalogSong {
  song: PublishedSong
  /** Community aliases of the song, in catalog order and without duplicates */
  aliases: string[]
  names: SongName[]
}

export interface McpCatalog {
  catalogRunId: string
  /** The published document itself, for consumers that build their own indexes (the oneshot renderer) */
  document: PublishedCatalog
  updatedAt: string
  songs: CatalogSong[]
  songsById: Map<string, CatalogSong>
  /** The song of each sheet ID */
  songsBySheetId: Map<string, CatalogSong>
  tagsById: Map<number, PublishedTag>
  tagGroupsById: Map<number, PublishedTagGroup>
  /** The tag IDs of each sheet ID */
  tagIdsBySheetId: Map<string, number[]>
  /** The names of the servers by ID */
  serverNames: Map<string, string>
}

const KATAKANA = /[ァ-ヶ]/g
const SEPARATORS = /[\s\p{P}\p{S}]/gu

/**
 * The search key of a text: NFKC (full-width letters and half-width kana fold), lower case, katakana as hiragana,
 * without spaces, punctuation and symbols. A text made only of symbols (`+♂`, `≠彡゛/了→`) keeps its symbols, so it
 * is still found by itself.
 */
export function searchKey(text: string): string {
  const folded = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(KATAKANA, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  return folded.replace(SEPARATORS, '') || folded.replace(/\s/gu, '')
}

export function buildMcpCatalog(catalogRunId: string, published: PublishedCatalog): McpCatalog {
  const aliasesBySongId = new Map<string, string[]>()
  for (const alias of published.aliases) {
    const name = alias.name.trim()
    if (!name) continue
    const aliases = aliasesBySongId.get(alias.song_id) ?? []
    if (!aliases.includes(name)) aliases.push(name)
    aliasesBySongId.set(alias.song_id, aliases)
  }

  const songs = published.songs.map((song): CatalogSong => {
    const aliases = aliasesBySongId.get(song.id) ?? []
    const names: SongName[] = []
    const seen = new Set<string>()
    const addName = (kind: NameKind, text: string) => {
      const key = searchKey(text)
      if (!key || seen.has(`${kind}\u0000${key}`)) return
      seen.add(`${kind}\u0000${key}`)
      names.push({ kind, text, key })
    }
    addName('title', song.title)
    for (const acronym of song.searchAcronyms) addName('acronym', acronym)
    for (const alias of aliases) addName('alias', alias)
    if (song.artist) addName('artist', song.artist)
    return { song, aliases, names }
  })

  const songsBySheetId = new Map<string, CatalogSong>()
  for (const entry of songs) {
    for (const sheet of entry.song.sheets) songsBySheetId.set(sheet.id, entry)
  }

  const tagIdsBySheetId = new Map<string, number[]>()
  for (const tagSong of published.tagSongs) {
    const tagIds = tagIdsBySheetId.get(tagSong.sheet_id) ?? []
    if (!tagIds.includes(tagSong.tag_id)) tagIds.push(tagSong.tag_id)
    tagIdsBySheetId.set(tagSong.sheet_id, tagIds)
  }

  return {
    catalogRunId,
    document: published,
    updatedAt: published.updatedAt,
    songs,
    songsById: new Map(songs.map((entry) => [entry.song.id, entry])),
    songsBySheetId,
    tagsById: new Map(published.tags.map((tag) => [tag.id, tag])),
    tagGroupsById: new Map(published.tagGroups.map((group) => [group.id, group])),
    tagIdsBySheetId,
    serverNames: new Map(published.servers.map((server) => [server.id, server.name])),
  }
}

export interface SongMatch {
  entry: CatalogSong
  score: number
  /** The name the query matched */
  matched: { kind: NameKind; text: string }
}

// The score of a match of each kind of name: a whole name beats the start of one, which beats a part of one; a
// title beats an acronym or an alias, which beat an artist (who has many songs)
const SCORES: Record<NameKind, { exact: number; prefix: number; contains: number }> = {
  title: { exact: 100, prefix: 70, contains: 50 },
  acronym: { exact: 90, prefix: 60, contains: 40 },
  alias: { exact: 90, prefix: 60, contains: 40 },
  artist: { exact: 35, prefix: 30, contains: 25 },
}

function scoreName(name: SongName, key: string): number {
  const scores = SCORES[name.kind]
  if (name.key === key) return scores.exact
  if (name.key.startsWith(key)) return scores.prefix
  if (name.key.includes(key)) return scores.contains
  return 0
}

/**
 * The songs whose title, acronyms, aliases or artist match query, best first: by score, then by the shorter matched
 * name (the closer match), then in catalog order.
 */
export function searchSongs(catalog: McpCatalog, query: string): SongMatch[] {
  const key = searchKey(query)
  if (!key) return []
  const matches: (SongMatch & { order: number; length: number })[] = []
  catalog.songs.forEach((entry, order) => {
    let best: SongMatch | undefined
    let length = Infinity
    for (const name of entry.names) {
      const score = scoreName(name, key)
      if (score > 0 && (!best || score > best.score || (score === best.score && name.key.length < length))) {
        best = { entry, score, matched: { kind: name.kind, text: name.text } }
        length = name.key.length
      }
    }
    if (best) matches.push({ ...best, order, length })
  })
  matches.sort((a, b) => b.score - a.score || a.length - b.length || a.order - b.order)
  return matches.map(({ entry, score, matched }) => ({ entry, score, matched }))
}

/** The songs a reference names: a song ID, a sheet ID, or a title or alias that is a whole name of the songs. */
export function resolveSongReference(catalog: McpCatalog, reference: string): CatalogSong[] {
  const trimmed = reference.trim()
  const byId = catalog.songsById.get(trimmed) ?? catalog.songsBySheetId.get(trimmed)
  if (byId) return [byId]
  const matches = searchSongs(catalog, trimmed).filter((match) => match.matched.kind !== 'artist')
  const exact = matches.filter((match) => match.score >= SCORES.alias.exact)
  // a title that is the whole query wins over aliases of other songs that happen to be the same
  const titles = exact.filter((match) => match.matched.kind === 'title')
  return (titles.length > 0 ? titles : exact).map((match) => match.entry)
}