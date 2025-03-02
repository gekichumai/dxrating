import { type DifficultyEnum, type Sheet, type Song, TypeEnum, type VersionEnum, dxdata } from '@gekichumai/dxdata'
import Fuse from 'fuse.js'
import uniq from 'lodash-es/uniq'
import { useMemo } from 'react'
import useSWR from 'swr'
import { useAppContext, useAppContextDXDataVersion } from './models/context/useAppContext'
import { useCombinedTags } from './models/useCombinedTags'
import { useServerAliases } from './models/useServerAliases'

const CANONICAL_ID_PARTS_SEPARATOR = '__dxrt__'

export type FlattenedSheet = Song &
  Sheet & {
    id: string
    isTypeUtage: boolean
    isRatingEligible: boolean
    tags: number[]
    releaseDateTimestamp: number
  }

export const canonicalId = (song: Song, sheet: Sheet) => {
  return [song.songId, sheet.type, sheet.difficulty].join(CANONICAL_ID_PARTS_SEPARATOR)
}

export const canonicalIdFromParts = (songId: string, type: TypeEnum, difficulty: DifficultyEnum) => {
  return [songId, type, difficulty].join(CANONICAL_ID_PARTS_SEPARATOR)
}

export const getSongs = (): Song[] => {
  return dxdata.songs
}

export const getFlattenedSheets = async (version: VersionEnum): Promise<FlattenedSheet[]> => {
  const songs = getSongs()
  const flattenedSheets = songs.flatMap((song) => {
    return song.sheets.map((sheet) => {
      const isTypeUtage = sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P
      return {
        ...song,
        ...sheet,
        id: canonicalId(song, sheet),
        searchAcronyms: song.searchAcronyms,
        isTypeUtage,
        isRatingEligible: !isTypeUtage,
        releaseDateTimestamp: sheet.releaseDate ? new Date(`${sheet.releaseDate}T06:00:00+09:00`).valueOf() : null,
        internalLevelValue: sheet.multiverInternalLevelValue
          ? (sheet.multiverInternalLevelValue[version] ?? sheet.internalLevelValue)
          : sheet.internalLevelValue,
      }
    })
  })
  return flattenedSheets as FlattenedSheet[]
}

export const useSheets = ({ acceptsPartialData = false } = {}) => {
  const appVersion = useAppContextDXDataVersion()
  const { data: combinedTags, isLoading: loadingCombinedTags } = useCombinedTags()
  const { data: serverAliases, isLoading: loadingServerAliases } = useServerAliases()
  const key = `dxdata::sheets?${new URLSearchParams({
    version: appVersion,
    loadingCombinedTags: String(loadingCombinedTags),
    loadingServerAliases: String(loadingServerAliases),
  }).toString()}`
  return useSWR(
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
    { suspense: false },
  )
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
        searchAcronyms: [
          ...song.searchAcronyms.filter((acronym) => acronym.length < 70),
          ...(serverAliases?.filter((alias) => alias.song_id === song.songId).map((alias) => alias.name) ?? []),
        ],
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

  const search = (term: string) => {
    const results = fuseInstance.search(term)
    return results.flatMap((result) => {
      return sheets?.filter((sheet) => sheet.songId === result.item.songId) ?? []
    })
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
    const end = performance.now()
    console.log(`Fuse search took ${end - start}ms`)

    return {
      results,
      elapsed: end - start,
    }
  }, [search, searchTerm, defaultResults])
}

export const formatSheetToString = (sheet: FlattenedSheet) => {
  const { title, type, difficulty, internalLevelValue } = sheet
  return `${title} [${type} ${difficulty} ${internalLevelValue.toFixed(1)}]`
}
