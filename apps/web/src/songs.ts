import type { DifficultyEnum, Song } from '@gekichumai/dxdata'
import type { SongCatalog, VersionedSheet } from '@gekichumai/maimai-domain'
import * as Sentry from '@sentry/tanstackstart-react'
import Fuse from 'fuse.js'
import uniq from 'lodash-es/uniq'
import { useMemo } from 'react'
import { useCatalogDocument, useSongCatalog } from './catalog/CatalogContext'
import { useCombinedTags, type CombinedTags } from './models/useCombinedTags'
import { useServerAliases } from './models/useServerAliases'

export type FlattenedSheet = VersionedSheet & {
  difficulty: DifficultyEnum
  releaseDateTimestamp: number
  tags: number[]
}

export interface ServerAlias {
  song_id: string
  name: string
}

export const getSearchAcronymsWithServerAliases = (
  song: { songId: string; searchAcronyms: readonly string[] },
  serverAliases?: readonly ServerAlias[] | null,
) => {
  return uniq([
    ...song.searchAcronyms,
    ...(serverAliases?.filter((alias) => alias.song_id === song.songId).map((alias) => alias.name) ?? []),
  ])
}

export const getFlattenedSheets = (catalog: SongCatalog): FlattenedSheet[] => {
  let sheets = flattenedSheetsCache.get(catalog)
  if (!sheets) {
    sheets = catalog.sheets.map((sheet) => ({
      ...sheet,
      difficulty: sheet.difficulty as DifficultyEnum,
      releaseDateTimestamp: sheet.releaseDateTimestamp as number,
      tags: [],
    }))
    flattenedSheetsCache.set(catalog, sheets)
  }
  return sheets
}

const flattenedSheetsCache = new WeakMap<SongCatalog, FlattenedSheet[]>()
const enrichedSheetsCache = new WeakMap<
  SongCatalog,
  {
    tagSongs: CombinedTags['tagSongs'] | undefined
    aliases: readonly ServerAlias[] | undefined
    sheets: FlattenedSheet[]
  }
>()

function getSheetsWithMetadata(
  catalog: SongCatalog,
  tagSongs: CombinedTags['tagSongs'] | undefined,
  aliases: readonly ServerAlias[] | undefined,
): FlattenedSheet[] {
  const sheets = getFlattenedSheets(catalog)
  if (!tagSongs?.length && !aliases?.length) return sheets

  // Share the derived catalog across consumers, invalidating on content references rather than counts.
  const cached = enrichedSheetsCache.get(catalog)
  if (cached && cached.tagSongs === tagSongs && cached.aliases === aliases) return cached.sheets

  const tagsBySheet = new Map<string, number[]>()
  for (const relation of tagSongs ?? []) {
    // Tags are listed with public IDs (idScheme=public), which always name the sheet
    const sheetId =
      relation.sheet_id ??
      catalog.getByIdentity({
        songId: relation.song_id,
        type: relation.sheet_type,
        difficulty: relation.sheet_difficulty,
      } as VersionedSheet['identity'])?.id
    if (!sheetId) continue
    const tags = tagsBySheet.get(sheetId) ?? []
    tags.push(relation.tag_id)
    tagsBySheet.set(sheetId, tags)
  }

  const aliasesBySong = new Map<string, string[]>()
  for (const alias of aliases ?? []) {
    const names = aliasesBySong.get(alias.song_id) ?? []
    names.push(alias.name)
    aliasesBySong.set(alias.song_id, names)
  }

  const enrichedSheets = sheets.map((sheet) => {
    const tags = tagsBySheet.get(sheet.id)
    const names = aliasesBySong.get(sheet.songId)
    if (!tags && !names) return sheet
    return {
      ...sheet,
      tags: tags ?? sheet.tags,
      searchAcronyms: names ? uniq([...sheet.searchAcronyms, ...names]) : sheet.searchAcronyms,
    }
  })
  enrichedSheetsCache.set(catalog, { tagSongs, aliases, sheets: enrichedSheets })
  return enrichedSheets
}

export const useSheets = () => {
  const catalog = useSongCatalog()
  const { data: combinedTags } = useCombinedTags()
  const { data: serverAliases } = useServerAliases()
  const data = getSheetsWithMetadata(catalog, combinedTags?.tagSongs, serverAliases)

  return { data, isLoading: false }
}

export const useSongs = () => ({ data: useCatalogDocument().songs })

type SheetsSearchEngineOptions = {
  songs?: readonly Song[] | null
  sheets?: readonly FlattenedSheet[] | null
  serverAliases?: readonly ServerAlias[] | null
}

export const createSheetsSearchEngine = ({
  songs,
  sheets,
  serverAliases,
}: SheetsSearchEngineOptions): ((term: string) => FlattenedSheet[]) => {
  const availableSheets = sheets ?? []
  // Building the index normalizes every sheet; defer it until the first real query so renders without a search term
  // (including every SSR of the default list) skip it entirely.
  let index: ReturnType<typeof buildSheetsSearchIndex> | undefined
  let lastSearch: { term: string; results: FlattenedSheet[] } | undefined

  return (term: string) => {
    const trimmedTerm = term.trim()
    if (!trimmedTerm) return []
    if (lastSearch?.term === trimmedTerm) return lastSearch.results
    index ??= buildSheetsSearchIndex(songs, availableSheets, serverAliases)
    const results = searchSheetsIndex(index, availableSheets, trimmedTerm)
    lastSearch = { term: trimmedTerm, results }
    return results
  }
}

const normalizeSearchText = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

function buildSheetsSearchIndex(
  songs: readonly Song[] | null | undefined,
  availableSheets: readonly FlattenedSheet[],
  serverAliases: readonly ServerAlias[] | null | undefined,
) {
  const fuseInstance = new Fuse(
    songs?.map((song) => ({
      ...song,
      searchAcronyms: getSearchAcronymsWithServerAliases(
        {
          songId: song.id,
          searchAcronyms: song.searchAcronyms.filter((acronym) => acronym.length < 70),
        },
        serverAliases,
      ),
    })) ?? [],
    {
      keys: [
        {
          name: 'searchAcronyms',
          weight: 2,
        },
        {
          name: 'title',
          weight: 1,
        },
      ],
      shouldSort: true,
      threshold: 0.4,
    },
  )

  const songsById = new Map((songs ?? []).map((song) => [song.id, song]))
  const indexedSheets = availableSheets.map((sheet) => {
    const song = songsById.get(sheet.songId)
    const aliases = song
      ? getSearchAcronymsWithServerAliases({ songId: song.id, searchAcronyms: song.searchAcronyms }, serverAliases)
      : sheet.searchAcronyms
    const designer = sheet.noteDesigner?.trim()
    return {
      sheet,
      fields: [sheet.title, song?.artist ?? sheet.artist, ...aliases, designer && designer !== '-' ? designer : ''].map(
        normalizeSearchText,
      ),
    }
  })

  const sheetsByInternalId = new Map<number, FlattenedSheet[]>()

  for (const sheet of availableSheets) {
    if (sheet.internalId === undefined) {
      continue
    }

    const existing = sheetsByInternalId.get(sheet.internalId) ?? []
    existing.push(sheet)
    sheetsByInternalId.set(sheet.internalId, existing)
  }

  return { fuseInstance, indexedSheets, sheetsByInternalId }
}

function searchSheetsIndex(
  { fuseInstance, indexedSheets, sheetsByInternalId }: ReturnType<typeof buildSheetsSearchIndex>,
  availableSheets: readonly FlattenedSheet[],
  trimmedTerm: string,
): FlattenedSheet[] {
  const tokens = normalizeSearchText(trimmedTerm).split(/\s+/u)
  const metadataResults = indexedSheets
    .filter(({ fields }) => tokens.every((token) => fields.some((field) => field.includes(token))))
    .map(({ sheet }) => sheet)

  // Get Fuse search results (alias/title matches)
  const titleResults = fuseInstance.search(trimmedTerm).flatMap((result) => {
    return availableSheets.filter((sheet) => sheet.songId === result.item.id)
  })

  const seen = new Set<string>()
  const fuseResults = [...titleResults, ...metadataResults].filter((sheet) => {
    if (seen.has(sheet.id)) return false
    seen.add(sheet.id)
    return true
  })

  // Check for exact Music ID match
  let internalIdResults: FlattenedSheet[] = []
  if (/^\d+$/.test(trimmedTerm)) {
    const targetInternalId = Number.parseInt(trimmedTerm, 10)
    if (!Number.isNaN(targetInternalId)) {
      internalIdResults = sheetsByInternalId.get(targetInternalId) ?? []
    }
  }

  // If exact Music ID match exists, put it at the top, followed by other results
  if (internalIdResults.length > 0) {
    const internalIdSet = new Set(internalIdResults.map((sheet) => sheet.id))
    const filteredFuseResults = fuseResults.filter((sheet) => !internalIdSet.has(sheet.id))
    return [...internalIdResults, ...filteredFuseResults]
  }

  return fuseResults
}

export const useSheetsSearchEngine = () => {
  const { data: songs } = useSongs()
  const { data: sheets } = useSheets()
  const { data: serverAliases } = useServerAliases()

  return useMemo(() => getSharedSheetsSearchEngine(songs, sheets, serverAliases), [songs, sheets, serverAliases])
}

// One engine per catalog snapshot, shared across components and (during SSR) across requests. The inputs are cached
// references, so identity is enough to tell when the catalog or its remote metadata changed.
let sharedSearchEngine:
  | {
      songs: readonly Song[]
      sheets: readonly FlattenedSheet[]
      serverAliases: readonly ServerAlias[] | null | undefined
      search: (term: string) => FlattenedSheet[]
    }
  | undefined

function getSharedSheetsSearchEngine(
  songs: readonly Song[],
  sheets: readonly FlattenedSheet[],
  serverAliases: readonly ServerAlias[] | null | undefined,
) {
  if (
    sharedSearchEngine?.songs === songs &&
    sharedSearchEngine.sheets === sheets &&
    sharedSearchEngine.serverAliases === serverAliases
  ) {
    return sharedSearchEngine.search
  }

  const search = createSheetsSearchEngine({ songs, sheets, serverAliases })
  sharedSearchEngine = { songs, sheets, serverAliases, search }
  return search
}

const NO_SHEETS: FlattenedSheet[] = []

export const useFilteredSheets = (searchTerm: string) => {
  const { data: sheets } = useSheets()
  const search = useSheetsSearchEngine()

  // The catalog arrays are cached and shared; consumers filter into new arrays before sorting, so pass them through
  // as-is to keep a stable identity for downstream memoization.
  const defaultResults = sheets ?? NO_SHEETS

  return useMemo(() => {
    const start = performance.now()
    const results = searchTerm === '' ? defaultResults : search(searchTerm)
    const elapsed = performance.now() - start

    Sentry.metrics.distribution('sheet_search.duration', elapsed, {
      unit: 'millisecond',
      attributes: { has_query: String(searchTerm !== '') },
    })

    return {
      results,
      elapsed,
    }
  }, [search, searchTerm, defaultResults])
}

export const formatSheetToString = (sheet: FlattenedSheet) => {
  const { title, type, difficulty, internalLevelValue } = sheet
  return `${title} [${type} ${difficulty} ${internalLevelValue.toFixed(1)}]`
}