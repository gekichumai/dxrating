import type { LegacySongIdMap } from '@gekichumai/maimai-domain'

// The legacy song ID map is only needed for data saved before public IDs (saved entries, favorites, rating files,
// links) and for provider music-ID maps, so it is loaded on demand in a chunk of its own.
let legacySongIds: Promise<LegacySongIdMap> | undefined

export const loadLegacySongIds = (): Promise<LegacySongIdMap> => {
  legacySongIds ??= import('@gekichumai/dxdata/legacy-song-ids').then((module) => module.LEGACY_SONG_IDS)
  return legacySongIds
}