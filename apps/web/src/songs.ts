import type { DifficultyEnum, Song } from '@gekichumai/dxdata'
import type { SongCatalog, VersionedSheet } from '@gekichumai/maimai-domain'
import * as Sentry from '@sentry/tanstackstart-react'
import uniq from 'lodash-es/uniq'
import { useEffect, useMemo } from 'react'
import { useCompleteCatalogDocument, useCompleteSongCatalog } from './catalog/CatalogContext'
import { useCombinedTags, type CombinedTags } from './models/useCombinedTags'
import { useServerAliases } from './models/useServerAliases'
import { buildSheetsSearchIndex, searchSheetsIndex, type SheetsSearchIndex } from './search/sheetSearchIndex'

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

/** Every sheet of the complete catalog; no data (`isLoading`) during SSR and until the complete catalog has loaded */
export const useSheets = () => {
  const catalog = useCompleteSongCatalog()
  const { data: combinedTags } = useCombinedTags()
  const { data: serverAliases } = useServerAliases()
  const data = catalog ? getSheetsWithMetadata(catalog, combinedTags?.tagSongs, serverAliases) : undefined

  return { data, isLoading: !catalog }
}

/** Every song of the complete catalog; no data until it has loaded */
export const useSongs = () => ({ data: useCompleteCatalogDocument()?.songs })

type SheetsSearchEngineOptions = {
  songs?: readonly Song[] | null
  sheets?: readonly FlattenedSheet[] | null
  serverAliases?: readonly ServerAlias[] | null
}

/** A search over the catalog's sheets; `prepare` builds its index ahead of the first query */
export type SheetsSearch = ((term: string) => FlattenedSheet[]) & { prepare: () => void }

export const createSheetsSearchEngine = ({ songs, sheets, serverAliases }: SheetsSearchEngineOptions): SheetsSearch => {
  const availableSheets = sheets ?? []
  // Building the index normalizes every sheet; defer it until the first real query so renders without a search term
  // (including every SSR of the default list) skip it entirely.
  let index: SheetsSearchIndex | undefined
  let lastSearch: { term: string; results: FlattenedSheet[] } | undefined

  const prepare = () => {
    index ??= buildSheetsSearchIndex(songs, availableSheets, serverAliases)
  }
  const search = (term: string) => {
    const trimmedTerm = term.trim()
    if (!trimmedTerm) return []
    if (lastSearch?.term === trimmedTerm) return lastSearch.results
    prepare()
    const results = searchSheetsIndex(index!, trimmedTerm)
    lastSearch = { term: trimmedTerm, results }
    return results
  }
  return Object.assign(search, { prepare })
}

export const useSheetsSearchEngine = () => {
  const { data: songs } = useSongs()
  const { data: sheets } = useSheets()
  const { data: serverAliases } = useServerAliases()

  const search = useMemo(
    () => (songs && sheets ? getSharedSheetsSearchEngine(songs, sheets, serverAliases) : searchNothing),
    [songs, sheets, serverAliases],
  )
  // Building the index normalizes every title, alias and reading (about 0.1-0.4s on a phone). Done while the page is
  // idle, the first keystroke no longer pays for it as input latency
  useEffect(() => {
    if (search === searchNothing) return undefined
    return whenIdle(search.prepare)
  }, [search])
  return search
}

/** Runs `task` once the main thread is idle (or after 2s at the latest); returns a cancel function */
const whenIdle = (task: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout: 2_000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(task, 300)
  return () => window.clearTimeout(handle)
}

// Until the complete catalog has loaded there is nothing to search
const searchNothing: SheetsSearch = Object.assign((_term: string): FlattenedSheet[] => [], { prepare: () => {} })

// One engine per catalog snapshot, shared across components and (during SSR) across requests. The inputs are cached
// references, so identity is enough to tell when the catalog or its remote metadata changed.
let sharedSearchEngine:
  | {
      songs: readonly Song[]
      sheets: readonly FlattenedSheet[]
      serverAliases: readonly ServerAlias[] | null | undefined
      search: SheetsSearch
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