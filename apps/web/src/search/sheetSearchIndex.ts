import type { Song } from '@gekichumai/dxdata'
import Fuse from 'fuse.js'
import type { FlattenedSheet, ServerAlias } from '../songs'
import { compactKey, normalizeText, skeletonKey, wordSuffixes } from './textKeys'

/**
 * Match tiers, best first. A song takes its best tier; sheets inherit it. Within a tier, shorter names (the closer
 * match) come first, then catalog order.
 */
const Tier = {
  /** The whole title */
  Title: 0,
  /** A whole alias */
  Alias: 1,
  /** A whole title, alias or reading in another script or romaji spelling */
  Spelling: 2,
  /** The start of the title */
  TitlePrefix: 3,
  /** The start of an alias or a reading, as typed */
  NamePrefix: 4,
  /** The start of a word inside the title or an alias, as typed */
  WordPrefix: 5,
  /** The start of a title, alias or reading in another script or romaji spelling, or the title's initials */
  SpellingPrefix: 6,
  /** Every query word appears somewhere in the title, artist, aliases, reading or the chart's designer */
  Contains: 7,
  /** Fuse's fuzzy match on titles and aliases, for typos */
  Fuzzy: 8,
} as const

/**
 * Fuse is most of the query time. With this many songs already matched by name, its fuzzy matches would only rank
 * after them, so it is skipped.
 */
const FUZZY_SKIP_AFTER = 20

/** Skeleton matching needs a few letters, or one-letter queries would match every romanised title */
const MIN_SKELETON_PREFIX = 2
const MIN_SKELETON_CONTAINS = 3

interface IndexedName {
  normalized: string
  compact: string
  skeleton: string
  /** The compact text from the start of each word to the end, for word-prefix matching */
  suffixes: string[]
}

interface IndexedSong {
  id: string
  order: number
  title: IndexedName
  aliases: IndexedName[]
  readings: IndexedName[]
  /** Initials of a title of three or more latin words ("Ultra Synergy Matrix" → usm) */
  initials?: string
  /** Normalized title, artist, aliases and readings, plus their skeletons, for word matching */
  fields: string[]
}

const indexName = (value: string): IndexedName => {
  const normalized = normalizeText(value)
  return { normalized, compact: compactKey(value), skeleton: skeletonKey(value), suffixes: wordSuffixes(normalized) }
}

/** Optional readings a catalog song may carry (hiragana) */
type SongWithReadings = Song & { reading?: string | null }

export function buildSheetsSearchIndex(
  songs: readonly Song[] | null | undefined,
  availableSheets: readonly FlattenedSheet[],
  serverAliases: readonly ServerAlias[] | null | undefined,
) {
  const serverAliasesBySong = new Map<string, string[]>()
  for (const alias of serverAliases ?? []) {
    const names = serverAliasesBySong.get(alias.song_id)
    if (names) names.push(alias.name)
    else serverAliasesBySong.set(alias.song_id, [alias.name])
  }
  const aliasesOf = (song: Song) => [...new Set([...song.searchAcronyms, ...(serverAliasesBySong.get(song.id) ?? [])])]

  const indexedSongs: IndexedSong[] = (songs ?? []).map((song, order) => {
    const aliases = aliasesOf(song).map(indexName)
    const reading = (song as SongWithReadings).reading
    const readings = reading ? [indexName(reading)] : []
    const title = indexName(song.title)
    const named = [title, ...aliases, ...readings]
    return {
      id: song.id,
      order,
      title,
      aliases,
      readings,
      initials: titleInitials(song.title),
      fields: [
        ...named.map((name) => name.normalized),
        normalizeText(song.artist),
        ...named.map((name) => name.skeleton),
      ],
    }
  })

  const fuse = new Fuse(
    (songs ?? []).map((song) => ({
      id: song.id,
      title: song.title,
      searchAcronyms: aliasesOf(song).filter((alias) => alias.length < 70),
    })),
    {
      keys: [
        { name: 'searchAcronyms', weight: 2 },
        { name: 'title', weight: 1 },
      ],
      shouldSort: true,
      threshold: 0.4,
    },
  )

  const sheetsBySong = new Map<string, FlattenedSheet[]>()
  const sheetsByInternalId = new Map<number, FlattenedSheet[]>()
  const designerBySheet = new Map<string, string>()
  for (const sheet of availableSheets) {
    const sheets = sheetsBySong.get(sheet.songId)
    if (sheets) sheets.push(sheet)
    else sheetsBySong.set(sheet.songId, [sheet])
    if (sheet.internalId !== undefined) {
      sheetsByInternalId.set(sheet.internalId, [...(sheetsByInternalId.get(sheet.internalId) ?? []), sheet])
    }
    const designer = sheet.noteDesigner?.trim()
    if (designer && designer !== '-') designerBySheet.set(sheet.id, normalizeText(designer))
  }

  // Sheets whose song is not in `songs` (only in tests) still match their own title, artist and aliases
  const knownSongs = new Set(indexedSongs.map((song) => song.id))
  const orphanFields = new Map<string, string[]>()
  for (const sheet of availableSheets) {
    if (knownSongs.has(sheet.songId)) continue
    orphanFields.set(sheet.id, [sheet.title, sheet.artist, ...sheet.searchAcronyms].map(normalizeText))
  }

  return { indexedSongs, fuse, sheetsBySong, sheetsByInternalId, designerBySheet, orphanFields, availableSheets }
}

function titleInitials(title: string): string | undefined {
  const words = normalizeText(title)
    .replace(/[(（[【].*$/u, '')
    .split(/[\s\-_/]+/u)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  if (words.length < 3 || !words.every((word) => /^[a-z]/u.test(word))) return undefined
  return words.map((word) => word[0]).join('')
}

export type SheetsSearchIndex = ReturnType<typeof buildSheetsSearchIndex>

function songTier(song: IndexedSong, compact: string, skeleton: string): { tier: number; length: number } | undefined {
  const names = [song.title, ...song.aliases, ...song.readings]
  if (compact && song.title.compact === compact) return { tier: Tier.Title, length: 0 }
  if (compact && song.aliases.some((alias) => alias.compact === compact)) return { tier: Tier.Alias, length: 0 }
  const useSkeleton = skeleton.length >= MIN_SKELETON_PREFIX
  if (useSkeleton && names.some((name) => name.skeleton === skeleton)) return { tier: Tier.Spelling, length: 0 }
  if (compact && song.title.compact.startsWith(compact)) {
    return { tier: Tier.TitlePrefix, length: song.title.compact.length }
  }
  let best: { tier: number; length: number } | undefined
  const consider = (tier: number, length: number) => {
    if (!best || tier < best.tier || (tier === best.tier && length < best.length)) best = { tier, length }
  }
  for (const name of names) {
    if (compact && name.compact.startsWith(compact)) consider(Tier.NamePrefix, name.compact.length)
  }
  if (best) return best
  for (const name of [song.title, ...song.aliases]) {
    if (compact && name.suffixes.some((suffix) => suffix.startsWith(compact))) {
      consider(Tier.WordPrefix, name.compact.length)
    }
  }
  if (best) return best
  for (const name of names) {
    if (useSkeleton && name.skeleton.startsWith(skeleton)) consider(Tier.SpellingPrefix, name.skeleton.length)
  }
  if (compact.length >= 3 && song.initials === compact) consider(Tier.SpellingPrefix, 0)
  return best
}

export function searchSheetsIndex(index: SheetsSearchIndex, trimmedTerm: string): FlattenedSheet[] {
  const { indexedSongs, fuse, sheetsBySong, sheetsByInternalId, designerBySheet, orphanFields, availableSheets } = index
  const normalized = normalizeText(trimmedTerm)
  const compact = compactKey(trimmedTerm)
  const skeleton = skeletonKey(trimmedTerm)
  const words = normalized.split(/\s+/u).filter(Boolean)
  const wordSkeletons = words.map(skeletonKey)

  const ranked: { sheet: FlattenedSheet; tier: number; length: number; order: number }[] = []
  const matchedSongs = new Set<string>()
  const containsAll = (fields: readonly string[], designer?: string) =>
    words.length > 0 &&
    words.every(
      (word, i) =>
        fields.some((field) => field.includes(word)) ||
        (designer?.includes(word) ?? false) ||
        ((wordSkeletons[i]?.length ?? 0) >= MIN_SKELETON_CONTAINS &&
          fields.some((field) => field.includes(wordSkeletons[i]!))),
    )
  /** Within Contains, a match in the title beats one in an alias, which beats the artist, designer or a spelling */
  const containsRank = (song: IndexedSong) => {
    if (words.every((word) => song.title.normalized.includes(word))) return 0
    const names = [song.title, ...song.aliases, ...song.readings]
    if (words.every((word) => names.some((name) => name.normalized.includes(word)))) return 1
    return 2
  }

  for (const song of indexedSongs) {
    const sheets = sheetsBySong.get(song.id)
    if (!sheets) continue
    const match = songTier(song, compact, skeleton)
    if (match) {
      matchedSongs.add(song.id)
      for (const sheet of sheets) ranked.push({ sheet, tier: match.tier, length: match.length, order: song.order })
      continue
    }
    // Contains is per sheet: a designer's name matches only the charts they made
    let rank: number | undefined
    for (const sheet of sheets) {
      if (containsAll(song.fields, designerBySheet.get(sheet.id))) {
        rank ??= containsRank(song)
        ranked.push({ sheet, tier: Tier.Contains, length: rank, order: song.order })
      }
    }
  }
  for (const [sheetId, fields] of orphanFields) {
    if (!containsAll(fields, designerBySheet.get(sheetId))) continue
    const sheet = availableSheets.find((candidate) => candidate.id === sheetId)!
    ranked.push({ sheet, tier: Tier.Contains, length: 0, order: Number.MAX_SAFE_INTEGER })
  }

  // Fuse's ranking breaks ties inside a tier and adds fuzzy matches for typos
  const fuseResults = matchedSongs.size >= FUZZY_SKIP_AFTER ? [] : fuse.search(trimmedTerm)
  const fuseRank = new Map(fuseResults.map((result, rank) => [result.item.id, rank]))

  // Stable sort keeps the catalog order of sheets within a song and between equal songs
  const tieBreak = (sheet: FlattenedSheet) => fuseRank.get(sheet.songId) ?? Number.MAX_SAFE_INTEGER
  ranked.sort(
    (a, b) => a.tier - b.tier || a.length - b.length || tieBreak(a.sheet) - tieBreak(b.sheet) || a.order - b.order,
  )
  const results = ranked.map(({ sheet }) => sheet)

  const seen = new Set(results.map((sheet) => sheet.id))
  for (const result of fuseResults) {
    if (matchedSongs.has(result.item.id)) continue
    for (const sheet of sheetsBySong.get(result.item.id) ?? []) {
      if (seen.has(sheet.id)) continue
      seen.add(sheet.id)
      results.push(sheet)
    }
  }

  // An exact music ID goes first
  if (/^\d+$/u.test(trimmedTerm)) {
    const byId = sheetsByInternalId.get(Number.parseInt(trimmedTerm, 10)) ?? []
    if (byId.length) {
      const ids = new Set(byId.map((sheet) => sheet.id))
      return [...byId, ...results.filter((sheet) => !ids.has(sheet.id))]
    }
  }
  return results
}