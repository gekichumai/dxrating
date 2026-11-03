import type { Song, SongCatalogDocument } from '@gekichumai/dxdata'
import { isPublicSongId, type LegacySongIdMap } from '@gekichumai/maimai-domain'
import { loadLegacySongIds } from './legacySongIds'

const songIndexes = new WeakMap<SongCatalogDocument, Map<string, Song>>()

/** The song of a public song ID (`dsng_…`) */
export function findSongById(document: SongCatalogDocument, songId: string): Song | undefined {
  let index = songIndexes.get(document)
  if (!index) {
    index = new Map(document.songs.map((song) => [song.id, song]))
    songIndexes.set(document, index)
  }
  return index.get(songId)
}

/**
 * The public song ID a legacy song ID (the `songId` of the retired dxdata.json, as old links and saved data carry it)
 * stands for: from the legacy song ID map, or for songs newer than the map, the one song titled so.
 */
export function resolveLegacySongId(
  document: SongCatalogDocument,
  legacySongId: string,
  legacySongIds: LegacySongIdMap,
): string | undefined {
  const mapped = legacySongIds[legacySongId]
  if (mapped && findSongById(document, mapped)) return mapped
  const titled = document.songs.filter((song) => song.title === legacySongId)
  return titled.length === 1 ? titled[0]!.id : undefined
}

export type SongRouteResolution = { song: Song } | { redirectSongId: string } | null

/** What a `songId` route parameter names: a song, a legacy song ID to redirect to its public ID, or nothing */
export async function resolveSongRouteParam(
  document: SongCatalogDocument,
  songIdParam: string,
): Promise<SongRouteResolution> {
  const song = findSongById(document, songIdParam)
  if (song) return { song }
  if (isPublicSongId(songIdParam)) return null

  const redirectSongId = resolveLegacySongId(document, songIdParam, await loadLegacySongIds())
  return redirectSongId ? { redirectSongId } : null
}