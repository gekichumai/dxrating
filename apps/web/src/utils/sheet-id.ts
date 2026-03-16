import type { Song } from '@gekichumai/dxdata'

/**
 * Resolve a URL-friendly sheet ID to a Song.
 *
 * Resolution order:
 * 1. Numeric → find the song containing a sheet with that internalId
 * 2. 40-char hex → match against SHA-1 of songId (not yet implemented, placeholder)
 * 3. Direct songId match
 */
export function resolveSheetId(id: string, songs: Song[]): Song | undefined {
  // 1. Numeric internalId match
  if (/^\d+$/.test(id)) {
    const targetId = Number.parseInt(id, 10)
    return songs.find((song) => song.sheets.some((sheet) => sheet.internalId === targetId))
  }

  // 2. Direct songId match (fallback)
  return songs.find((song) => song.songId === id)
}

/**
 * Get a stable URL path for a song's detail page.
 * Prefers the numeric internalId of the first sheet; falls back to songId.
 */
export function getSongPath(song: Song): string {
  for (const sheet of song.sheets) {
    if (sheet.internalId !== undefined) {
      return String(sheet.internalId)
    }
  }
  return encodeURIComponent(song.songId)
}
