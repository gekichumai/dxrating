// The legacy song ID (the `songId` of the retired dxdata.json, mostly the song title) of every song that had one,
// mapped to its public song ID. Saved rating entries, favorites, exported rating files and provider music-ID maps
// still name songs by legacy ID; this is what migrates them. Generated once by scripts/build-legacy-song-ids.ts
// from the last legacy dxdata.json and the API catalog; legacy IDs are frozen, so it never needs regenerating.
import legacySongIdsJson from './legacy-song-ids.json' with { type: 'json' }

export const LEGACY_SONG_IDS: Readonly<Record<string, string>> = legacySongIdsJson