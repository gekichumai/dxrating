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
  /** A whole title, alias or reading in another script or romaji spelling (for a latin query, the start of the title) */
  Spelling: 2,
  /** The start of the title, as typed (for a latin query, a whole spelling: a romaji reading is a guess) */
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
  artist: string
  /** Initials of a title of three or more latin words ("Ultra Synergy Matrix" → usm) */
  initials?: string
  /** Normalized title, artist, aliases and readings, plus their skeletons, for word matching */
  fields: string[]
}

const indexName = (value: string): IndexedName => {
  const normalized = normalizeText(value)
  return { normalized, compact: compactKey(value), skeleton: skeletonKey(value), suffixes: wordSuffixes(normalized) }
}

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
    const readings = song.reading ? [indexName(song.reading)] : []
    const title = indexName(song.title)
    const artist = normalizeText(song.artist)
    const named = [title, ...aliases, ...readings]
    return {
      id: song.id,
      order,
      title,
      aliases,
      readings,
      artist,
      initials: titleInitials(song.title),
      fields: [...named.map((name) => name.normalized), artist, ...named.map((name) => name.skeleton)],
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

function songTier(
  song: IndexedSong,
  compact: string,
  skeleton: string,
  latinQuery: boolean,
): { tier: number; length: number } | undefined {
  const names = [song.title, ...song.aliases, ...song.readings]
  if (compact && song.title.compact === compact) return { tier: Tier.Title, length: 0 }
  if (compact && song.aliases.some((alias) => alias.compact === compact)) return { tier: Tier.Alias, length: 0 }
  const useSkeleton = skeleton.length >= MIN_SKELETON_PREFIX
  const titlePrefix = compact !== '' && song.title.compact.startsWith(compact)
  const spelling = useSkeleton && names.some((name) => name.skeleton === skeleton)
  // For a latin query the two swap places: "shoo" is more likely the start of "Shooting Stars" than 唱 (しょう) in romaji
  if (latinQuery) {
    if (titlePrefix) return { tier: Tier.Spelling, length: song.title.compact.length }
    if (spelling) return { tier: Tier.TitlePrefix, length: 0 }
  } else {
    if (spelling) return { tier: Tier.Spelling, length: 0 }
    if (titlePrefix) return { tier: Tier.TitlePrefix, length: song.title.compact.length }
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
  const latinQuery = /^[a-z0-9]+$/u.test(compact)

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
  /**
   * Within Contains, a match in the title beats one in an alias or reading, which beats the artist or designer, which
   * beats a match only in another spelling
   */
  const containsRank = (song: IndexedSong, designer?: string) => {
    if (words.every((word) => song.title.normalized.includes(word))) return 0
    const named = [song.title, ...song.aliases, ...song.readings]
    const names = named.map((name) => name.normalized)
    if (words.every((word) => names.some((name) => name.includes(word)))) return 1
    // The names without spaces count as typed too ("ym" in "My My My")
    const literal = [...names, ...named.map((name) => name.compact), song.artist, ...(designer ? [designer] : [])]
    if (words.every((word) => literal.some((field) => field.includes(word)))) return 2
    return 3
  }

  for (const song of indexedSongs) {
    const sheets = sheetsBySong.get(song.id)
    if (!sheets) continue
    const match = songTier(song, compact, skeleton, latinQuery)
    if (match) {
      matchedSongs.add(song.id)
      for (const sheet of sheets) ranked.push({ sheet, tier: match.tier, length: match.length, order: song.order })
      continue
    }
    // Contains is per sheet: a designer's name matches only the charts they made
    for (const sheet of sheets) {
      const designer = designerBySheet.get(sheet.id)
      if (containsAll(song.fields, designer)) {
        ranked.push({ sheet, tier: Tier.Contains, length: containsRank(song, designer), order: song.order })
      }
    }
  }
  for (const [sheetId, fields] of orphanFields) {
    if (!containsAll(fields, designerBySheet.get(sheetId))) continue
    const sheet = availableSheets.find((candidate) => candidate.id === sheetId)!
    ranked.push({ sheet, tier: Tier.Contains, length: 0, order: Number.MAX_SAFE_INTEGER })
  }

  // Fuse's ranking breaks ties inside a tier and adds fuzzy matches for typos
  // The result list is unbounded and filtered afterwards (favourites, levels), so fuzzy matches are always kept
  const fuseResults = fuse.search(trimmedTerm)
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