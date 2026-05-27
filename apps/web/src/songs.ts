import { type DifficultyEnum, type DXData, type Sheet, type Song, TypeEnum, type VersionEnum } from '@gekichumai/dxdata'
import { formatSheetIdentity } from '@gekichumai/maimai-domain/sheet-identity'
import { buildSongCatalog } from '@gekichumai/maimai-domain/song-catalog'
import type { VersionedSheet } from '@gekichumai/maimai-domain/types'
import * as Sentry from '@sentry/tanstackstart-react'
import Fuse from 'fuse.js'
import uniq from 'lodash-es/uniq'
import { useMemo } from 'react'
import useSWR from 'swr'
import { useAppContext, useAppContextDXDataVersion } from './models/context/useAppContext'
import { useCombinedTags } from './models/useCombinedTags'
import { useServerAliases } from './models/useServerAliases'

export type FlattenedSheet = VersionedSheet & {
  difficulty: DifficultyEnum
  releaseDateTimestamp: number
  tags: number[]
}

export const canonicalId = (song: Song, sheet: Sheet) => {
  return formatSheetIdentity({
    songId: song.songId,
    type: sheet.type,
    difficulty: sheet.difficulty,
  })
}

export const canonicalIdFromParts = (songId: string, type: TypeEnum, difficulty: DifficultyEnum) => {
  return formatSheetIdentity({ songId, type, difficulty })
}

let dxdataPromise: Promise<DXData> | null = null

const loadDxdata = async () => {
  dxdataPromise ??= import('@gekichumai/dxdata/data').then((module) => module.dxdata)
  return dxdataPromise
}

export const getSongs = async (): Promise<Song[]> => {
  return (await loadDxdata()).songs
}

export interface ServerAlias {
  song_id: string
  name: string
}

export const getSearchAcronymsWithServerAliases = (
  song: Pick<Song, 'songId' | 'searchAcronyms'>,
  serverAliases?: readonly ServerAlias[] | null,
) => {
  return uniq([
    ...song.searchAcronyms,
    ...(serverAliases?.filter((alias) => alias.song_id === song.songId).map((alias) => alias.name) ?? []),
  ])
}

export const getFlattenedSheets = async (version: VersionEnum): Promise<FlattenedSheet[]> => {
  const data = await loadDxdata()
  return buildSongCatalog(data, version).sheets.map((sheet) => ({
    ...sheet,
    difficulty: sheet.difficulty as DifficultyEnum,
    releaseDateTimestamp: sheet.releaseDateTimestamp as number,
    tags: [],
  }))
}

export const useSheets = ({ acceptsPartialData = false } = {}) => {
  const appVersion = useAppContextDXDataVersion()
  const { data: combinedTags, isLoading: loadingCombinedTags } = useCombinedTags()
  const { data: serverAliases, isLoading: loadingServerAliases } = useServerAliases()
  const key = `dxdata::sheets?${new URLSearchParams({
    version: appVersion,
    loadingCombinedTags: String(loadingCombinedTags),
    loadingServerAliases: String(loadingServerAliases),
    aliasCount: String(serverAliases?.length ?? 0),
    tagSongsCount: String(combinedTags?.tagSongs.length ?? 0),
  }).toString()}`
  const swr = useSWR(
    acceptsPartialData ? key : !(loadingCombinedTags || loadingServerAliases) && key,
    async () => {
      const sheets = await getFlattenedSheets(appVersion)

      if (!combinedTags) {
        return sheets.map((sheet) => ({
          ...sheet,
          tags: [],
        }))
      }

      const map = new Map<string, number[]>()
      for (const relation of combinedTags.tagSongs) {
        const canonical = canonicalIdFromParts(
          relation.song_id,
          relation.sheet_type as TypeEnum,
          relation.sheet_difficulty as DifficultyEnum,
        )
        const tags = map.get(canonical) ?? []
        tags.push(relation.tag_id)
        map.set(canonical, tags)
      }

      if (!serverAliases) {
        return sheets.map((sheet) => ({
          ...sheet,
          tags: map.get(sheet.id) ?? [],
        }))
      }

      const aliasMap = new Map<string, string[]>()
      for (const alias of serverAliases) {
        const aliases = aliasMap.get(alias.song_id) ?? []
        aliases.push(alias.name)
        aliasMap.set(alias.song_id, aliases)
      }

      return sheets.map((sheet) => {
        return {
          ...sheet,
          tags: map.get(sheet.id) ?? [],
          searchAcronyms: uniq([...sheet.searchAcronyms, ...(aliasMap.get(sheet.songId) ?? [])]),
        }
      })
    },
    {
      keepPreviousData: acceptsPartialData,
      suspense: false,
    },
  )

  if (acceptsPartialData && swr.data !== undefined && swr.isLoading) {
    return {
      ...swr,
      isLoading: false,
    }
  }

  return swr
}

export const useSongs = () => {
  const { version } = useAppContext()
  return useSWR(`dxdata::songs::${version}`, () => getSongs())
}

export const useSheetsSearchEngine = () => {
  const { data: songs } = useSongs()
  const { data: sheets } = useSheets({ acceptsPartialData: true })
  const { data: serverAliases } = useServerAliases()

  const fuseInstance = useMemo(() => {
    return new Fuse(
      songs?.map((song) => ({
        ...song,
        searchAcronyms: getSearchAcronymsWithServerAliases(
          {
            songId: song.songId,
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
  }, [songs, serverAliases])

  const sheetsByInternalId = useMemo(() => {
    const map = new Map<number, FlattenedSheet[]>()

    for (const sheet of sheets ?? []) {
      if (sheet.internalId === undefined) {
        continue
      }

      const existing = map.get(sheet.internalId) ?? []
      existing.push(sheet)
      map.set(sheet.internalId, existing)
    }

    return map
  }, [sheets])

  const search = (term: string) => {
    const trimmedTerm = term.trim()

    // Get Fuse search results (alias/title matches)
    const fuseResults = fuseInstance.search(trimmedTerm).flatMap((result) => {
      return sheets?.filter((sheet) => sheet.songId === result.item.songId) ?? []
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

  return search
}

export const useFilteredSheets = (searchTerm: string) => {
  const { data: sheets } = useSheets({ acceptsPartialData: true })
  const search = useSheetsSearchEngine()

  const defaultResults = useMemo(() => {
    return (sheets ?? []).slice()
  }, [sheets])

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