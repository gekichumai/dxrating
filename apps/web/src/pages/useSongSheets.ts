import type { DifficultyEnum, Song } from '@gekichumai/dxdata'
import { useMemo } from 'react'
import { useCatalogDocument, useSongCatalog } from '@/catalog/CatalogContext'
import { findSongById } from '@/catalog/songLookup'
import { useServerAliases } from '@/models/useServerAliases'
import { type FlattenedSheet, getSearchAcronymsWithServerAliases } from '@/songs'
import { sheetReleaseDateTimestamp } from '@/utils/dateFormatting'

/** A song from the catalog with its aliases (including server aliases) and its charts flattened for display */
export function useSongSheets(songId: string | undefined): {
  song: Song | null
  searchAcronyms: string[]
  flattenedSheets: FlattenedSheet[]
} {
  const catalogDocument = useCatalogDocument()
  const catalog = useSongCatalog()
  const { data: serverAliases } = useServerAliases()

  const song = useMemo(() => {
    if (!songId) return null
    return findSongById(catalogDocument, songId) ?? null
  }, [catalogDocument, songId])

  const searchAcronyms = useMemo(() => {
    if (!song) return []
    return getSearchAcronymsWithServerAliases({ songId: song.id, searchAcronyms: song.searchAcronyms }, serverAliases)
  }, [song, serverAliases])

  const flattenedSheets = useMemo<FlattenedSheet[]>(() => {
    if (!song) return []
    return song.sheets.flatMap((sheet) => {
      const versioned = catalog.getById(sheet.id)
      if (!versioned) return []
      return [
        {
          ...versioned,
          difficulty: versioned.difficulty as DifficultyEnum,
          searchAcronyms,
          tags: [],
          releaseDateTimestamp: sheetReleaseDateTimestamp(sheet.releaseDate),
        },
      ]
    })
  }, [song, catalog, searchAcronyms])

  return { song, searchAcronyms, flattenedSheets }
}