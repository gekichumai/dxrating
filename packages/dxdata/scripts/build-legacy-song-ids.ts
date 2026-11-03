// Generates legacy-song-ids.json: the public song ID of every song of the retired dxdata.json, by legacy song ID.
//
//   node scripts/build-legacy-song-ids.ts <legacy dxdata.json> [catalog.json, default snapshot.json]
//
// The API catalog carries no legacy IDs, so songs are matched on what both catalogs share: title, artist, category,
// cover and the set of sheets. Songs that share all of these (Utage charts split per difficulty) are told apart by
// their sheets' levels. A legacy song without exactly one match is left out and reported; the web falls back to an
// unambiguous title match for it. Verified against the backend's own legacy → public translations of tags and
// aliases when generated (see #386).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface LegacySheet {
  type: string
  difficulty: string
  level: string
  internalId?: number
}
interface LegacySong {
  songId: string
  title: string
  artist: string
  category: string
  imageName: string
  sheets: LegacySheet[]
}
interface CatalogSong extends Omit<LegacySong, 'songId'> {
  id: string
}

const [legacyPath, catalogPath = fileURLToPath(new URL('../snapshot.json', import.meta.url))] = process.argv.slice(2)
if (!legacyPath) throw new Error('usage: build-legacy-song-ids.ts <legacy dxdata.json> [catalog.json]')

const legacySongs = (JSON.parse(readFileSync(legacyPath, 'utf8')) as { songs: LegacySong[] }).songs
const catalogSongs = (JSON.parse(readFileSync(catalogPath, 'utf8')) as { songs: CatalogSong[] }).songs

const sheetSet = (song: LegacySong | CatalogSong) =>
  song.sheets
    .map((sheet) => `${sheet.type}\u0000${sheet.difficulty}`)
    .sort()
    .join('\u0001')
const songKey = (song: LegacySong | CatalogSong) =>
  [song.title, song.artist, song.category, song.imageName, sheetSet(song)].join('\u0002')
const sheetDetails = (song: LegacySong | CatalogSong) =>
  song.sheets
    .map((sheet) => [sheet.type, sheet.difficulty, sheet.level, sheet.internalId ?? ''].join('\u0000'))
    .sort()
    .join('\u0001')

const candidatesByKey = new Map<string, CatalogSong[]>()
for (const song of catalogSongs) {
  const key = songKey(song)
  candidatesByKey.set(key, [...(candidatesByKey.get(key) ?? []), song])
}

const mapping: Record<string, string> = {}
const unmatched: string[] = []
const assigned = new Map<string, string>()
for (const song of legacySongs) {
  let candidates = candidatesByKey.get(songKey(song)) ?? []
  if (candidates.length > 1)
    candidates = candidates.filter((candidate) => sheetDetails(candidate) === sheetDetails(song))
  const [match] = candidates
  if (candidates.length !== 1 || !match) {
    unmatched.push(`${song.songId} (${candidates.length} candidates)`)
    continue
  }
  const previous = assigned.get(match.id)
  if (previous) throw new Error(`${match.id} matches both ${previous} and ${song.songId}`)
  assigned.set(match.id, song.songId)
  mapping[song.songId] = match.id
}

const sorted = Object.fromEntries(Object.entries(mapping).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
writeFileSync(
  fileURLToPath(new URL('../legacy-song-ids.json', import.meta.url)),
  `${JSON.stringify(sorted, null, 2)}\n`,
)
console.log(`legacy-song-ids.json: ${Object.keys(sorted).length} of ${legacySongs.length} legacy songs`)
if (unmatched.length > 0) console.log(`not matched (title fallback applies): ${unmatched.join(', ')}`)