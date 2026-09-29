import { DifficultyEnum, type Sheet, type Song, TypeEnum, type VersionEnum, dxdata } from '@gekichumai/dxdata'
import { formatSheetIdentity, getDxdataSongCatalog, type VersionedSheet } from '@gekichumai/maimai-domain'
import * as Sentry from '@sentry/tanstackstart-react'
import Fuse from 'fuse.js'
import uniq from 'lodash-es/uniq'
import { useMemo } from 'react'
import { useAppContextDXDataVersion } from './models/context/useAppContext'
import { useCombinedTags, type CombinedTags } from './models/useCombinedTags'
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

export const getSongs = (): Song[] => {
  return dxdata.songs
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

export const getFlattenedSheetsForVersion = (version: VersionEnum): FlattenedSheet[] => {
  return getDxdataSongCatalog(version).sheets.map((sheet) => ({
    ...sheet,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Generated DX data includes custom Utage difficulty labels outside its declared enum.
    difficulty: sheet.difficulty as DifficultyEnum,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- getDxdataSongCatalog always supplies the release timestamp for this generated catalog.
    releaseDateTimestamp: sheet.releaseDateTimestamp as number,
    tags: [],
  }))
}

const bundledSheetsCache = new Map<VersionEnum, FlattenedSheet[]>()
const enrichedSheetsCache = new Map<
  VersionEnum,
  {
    tagSongs: CombinedTags['tagSongs'] | undefined
    aliases: readonly ServerAlias[] | undefined
    sheets: FlattenedSheet[]
  }
>()

function getSheetsWithMetadata(
  version: VersionEnum,
  tagSongs: CombinedTags['tagSongs'] | undefined,
  aliases: readonly ServerAlias[] | undefined,
): FlattenedSheet[] {
  let sheets = bundledSheetsCache.get(version)
  if (sheets === null || sheets === undefined) {
    sheets = getFlattenedSheetsForVersion(version)
    bundledSheetsCache.set(version, sheets)
  }
  if ((tagSongs?.length ?? 0) === 0 && (aliases?.length ?? 0) === 0) return sheets

  // Share the derived catalog across consumers, invalidating on content references rather than counts.
  const cached = enrichedSheetsCache.get(version)
  if (cached !== null && cached !== undefined && cached.tagSongs === tagSongs && cached.aliases === aliases)
    return cached.sheets

  const tagsBySheet = new Map<string, number[]>()
  for (const relation of tagSongs ?? []) {
    const id = canonicalIdFromParts(
      relation.song_id,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Tag API identities use the generated DX data vocabulary.
      relation.sheet_type as TypeEnum,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Tag identities include custom Utage labels outside the declared enum.
      relation.sheet_difficulty as DifficultyEnum,
    )
    const tags = tagsBySheet.get(id) ?? []
    tags.push(relation.tag_id)
    tagsBySheet.set(id, tags)
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
    if ((tags === null || tags === undefined) && (names === null || names === undefined)) return sheet
    return {
      ...sheet,
      tags: tags ?? sheet.tags,
      searchAcronyms:
        names !== null && names !== undefined ? uniq([...sheet.searchAcronyms, ...names]) : sheet.searchAcronyms,
    }
  })
  enrichedSheetsCache.set(version, { tagSongs, aliases, sheets: enrichedSheets })
  return enrichedSheets
}

export const useSheets = () => {
  const version = useAppContextDXDataVersion()
  const { data: combinedTags } = useCombinedTags()
  const { data: serverAliases } = useServerAliases()
  const data = getSheetsWithMetadata(version, combinedTags?.tagSongs, serverAliases)

  // The bundled catalog is available during SSR and every client render. Remote metadata only enriches it.
  return { data, isLoading: false }
}

export const useSongs = () => ({ data: getSongs() })

type SheetsSearchEngineOptions = {
  songs?: readonly Song[] | null
  sheets?: readonly FlattenedSheet[] | null
  serverAliases?: readonly ServerAlias[] | null
}

const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

export const createSheetsSearchEngine = ({
  songs,
  sheets,
  serverAliases,
}: SheetsSearchEngineOptions): ((term: string) => FlattenedSheet[]) => {
  const availableSheets = sheets ?? []
  const fuseInstance = new Fuse(
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

  const songsById = new Map((songs ?? []).map((song) => [song.songId, song]))
  const indexedSheets = availableSheets.map((sheet) => {
    const song = songsById.get(sheet.songId)
    const aliases =
      song !== null && song !== undefined
        ? getSearchAcronymsWithServerAliases(song, serverAliases)
        : sheet.searchAcronyms
    const designer = sheet.noteDesigner?.trim()
    return {
      sheet,
      fields: [
        sheet.title,
        song?.artist ?? sheet.artist,
        ...aliases,
        designer !== null && designer !== undefined && designer !== '' && designer !== '-' ? designer : '',
      ].map(normalize),
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

  return (term: string) => {
    const trimmedTerm = term.trim()
    if (trimmedTerm === '') return []
    const tokens = normalize(trimmedTerm).split(/\s+/u)
    const metadataResults = indexedSheets
      .filter(({ fields }) => tokens.every((token) => fields.some((field) => field.includes(token))))
      .map(({ sheet }) => sheet)

    // Get Fuse search results (alias/title matches)
    const titleResults = fuseInstance.search(trimmedTerm).flatMap((result) => {
      return availableSheets.filter((sheet) => sheet.songId === result.item.songId)
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
}

export const useSheetsSearchEngine = () => {
  const { data: songs } = useSongs()
  const { data: sheets } = useSheets()
  const { data: serverAliases } = useServerAliases()

  return useMemo(() => createSheetsSearchEngine({ songs, sheets, serverAliases }), [songs, sheets, serverAliases])
}

export const useFilteredSheets = (searchTerm: string) => {
  const { data: sheets } = useSheets()
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