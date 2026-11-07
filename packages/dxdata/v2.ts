// dxdata v2 (gekichumai/meta#43): the catalog and its community data as two documents.
//
// - The catalog (`GET /api/v2/dxdata`) is the v1 catalog without its community data, and without the values every
//   song or sheet would otherwise repeat. Field names are the v1 ones. A field that is absent takes its default
//   (see `fromV2Catalog`), and every field this module does not know passes through unchanged, so new producer fields
//   reach v2 clients without a change here.
// - The community overlay (`GET /api/v2/dxdata/community`) holds the tags and aliases, keyed by public IDs. It changes
//   within minutes, while the catalog changes about daily, so the two are cached and revalidated apart.
//
// `toV2…` runs on the backend; `fromV2…` rebuilds the v1 shapes the clients already render from. Both are pure.
import type {
  CatalogAlias,
  CatalogServer,
  CatalogTag,
  CatalogTagGroup,
  CatalogTagSong,
  CategoryElement,
  DifficultyElement,
  ServerEnum,
  Sheet,
  Song,
  SongCatalogDocument,
  TypeElement,
  VersionElement,
  VersionEnum,
} from './index.ts'

/** The v1 catalog without its community data */
export type CatalogV1 = Omit<SongCatalogDocument, 'tagGroups' | 'tags' | 'tagSongs' | 'aliases'>

export interface CatalogV2Sheet extends Omit<Sheet, 'serverIds' | 'isSpecial' | 'version'> {
  /** Absent when the sheet is on every server of the catalog's `servers`, in that order */
  serverIds?: ServerEnum[]
  /** Absent when false */
  isSpecial?: true
  /** Absent when it is the song's version */
  version?: VersionEnum
}

export interface CatalogV2Song extends Omit<Song, 'sheets' | 'isNew' | 'isLocked' | 'searchAcronyms'> {
  /** Absent when false */
  isNew?: true
  /** Absent when false */
  isLocked?: true
  /** Absent when empty */
  searchAcronyms?: string[]
  sheets: CatalogV2Sheet[]
}

/** The v2 catalog document (`schemaVersion` 2) */
export interface CatalogV2Document {
  schemaVersion: 2
  /** When the producer built this catalog (RFC 3339), as in v1 */
  updatedAt: string
  categories: CategoryElement[]
  versions: VersionElement[]
  types: TypeElement[]
  difficulties: DifficultyElement[]
  servers: CatalogServer[]
  songs: CatalogV2Song[]
}

/** The v2 community overlay (`schemaVersion` 2): tags and aliases of the catalog, by public ID */
export interface CommunityV2Document {
  schemaVersion: 2
  tagGroups: CatalogTagGroup[]
  tags: CatalogTag[]
  /** Tag ID → the public IDs of the sheets it is attached to, visible ones only (no vote scores) */
  sheetTags: Record<string, string[]>
  /** Public song ID → its aliases, each once */
  aliases: Record<string, string[]>
}

const sameServers = (serverIds: readonly string[], servers: readonly CatalogServer[]) =>
  serverIds.length === servers.length && serverIds.every((id, index) => id === servers[index]!.id)

export const toV2Catalog = (catalog: CatalogV1): CatalogV2Document => {
  const { schemaVersion: _schemaVersion, songs, ...rest } = catalog as CatalogV1 & Partial<SongCatalogDocument>
  // The community data lives in the overlay
  const { tagGroups: _tagGroups, tags: _tags, tagSongs: _tagSongs, aliases: _aliases, ...meta } = rest
  return {
    schemaVersion: 2,
    ...meta,
    songs: songs.map(({ sheets, isNew, isLocked, searchAcronyms, ...song }) => ({
      ...song,
      ...(isNew ? { isNew: true } : {}),
      ...(isLocked ? { isLocked: true } : {}),
      ...(searchAcronyms.length > 0 ? { searchAcronyms } : {}),
      sheets: sheets.map(({ serverIds, isSpecial, version, ...sheet }) => ({
        ...sheet,
        ...(sameServers(serverIds, catalog.servers) ? {} : { serverIds }),
        ...(isSpecial ? { isSpecial: true } : {}),
        ...(version === song.version ? {} : { version }),
      })),
    })),
  }
}

export const fromV2Catalog = (catalog: CatalogV2Document): CatalogV1 => {
  const { schemaVersion: _schemaVersion, songs, ...meta } = catalog
  const allServers = catalog.servers.map((server) => server.id)
  return {
    schemaVersion: 1,
    ...meta,
    songs: songs.map(({ sheets, isNew, isLocked, searchAcronyms, ...song }) => ({
      ...song,
      isNew: isNew === true,
      isLocked: isLocked === true,
      searchAcronyms: searchAcronyms ?? [],
      sheets: sheets.map(({ serverIds, isSpecial, version, ...sheet }) => ({
        ...sheet,
        serverIds: serverIds ?? [...allServers],
        isSpecial: isSpecial === true,
        version: version ?? song.version,
      })),
    })),
  }
}

/** The overlay from the v1 tag list (already filtered to visible associations) and alias list */
export const toV2Community = (
  tags: { tagGroups: CatalogTagGroup[]; tags: CatalogTag[]; tagSongs: readonly Pick<CatalogTagSong, 'tag_id'>[] },
  aliases: readonly CatalogAlias[],
): CommunityV2Document => {
  const sheetTags: Record<string, string[]> = {}
  for (const { tag_id, sheet_id } of tags.tagSongs as readonly Partial<CatalogTagSong>[]) {
    // Only public sheet IDs can be addressed in v2
    if (tag_id === undefined || sheet_id === undefined) continue
    const sheets = (sheetTags[String(tag_id)] ??= [])
    if (!sheets.includes(sheet_id)) sheets.push(sheet_id)
  }
  const bySong: Record<string, string[]> = {}
  for (const { song_id, name } of aliases) {
    const names = (bySong[song_id] ??= [])
    if (!names.includes(name)) names.push(name)
  }
  return {
    schemaVersion: 2,
    tagGroups: tags.tagGroups.map(({ id, localized_name, color }) => ({ id, localized_name, color })),
    tags: tags.tags.map(({ id, localized_name, localized_description, group_id }) => ({
      id,
      localized_name,
      localized_description,
      ...(group_id === undefined || group_id === null ? {} : { group_id }),
    })),
    sheetTags,
    aliases: bySong,
  }
}

/**
 * The v1 tag and alias lists from the overlay, resolving each sheet against the catalog. A sheet or song the catalog
 * does not have (the overlay can be newer or older than the catalog) is left out.
 */
export const fromV2Community = (
  community: CommunityV2Document,
  catalog: Pick<CatalogV1, 'songs'>,
): Pick<SongCatalogDocument, 'tagGroups' | 'tags' | 'tagSongs' | 'aliases'> => {
  const sheets = new Map<string, { song: Song; sheet: Sheet }>()
  for (const song of catalog.songs) for (const sheet of song.sheets) sheets.set(sheet.id, { song, sheet })
  const songIds = new Set(catalog.songs.map((song) => song.id))

  const tagSongs: CatalogTagSong[] = []
  for (const [tagId, sheetIds] of Object.entries(community.sheetTags)) {
    for (const sheetId of sheetIds) {
      const found = sheets.get(sheetId)
      if (!found) continue
      tagSongs.push({
        song_id: found.song.id,
        sheet_id: sheetId,
        sheet_type: found.sheet.type,
        sheet_difficulty: found.sheet.difficulty,
        tag_id: Number(tagId),
      })
    }
  }
  const aliases: CatalogAlias[] = Object.entries(community.aliases).flatMap(([songId, names]) =>
    songIds.has(songId) ? names.map((name) => ({ song_id: songId, name })) : [],
  )
  return { tagGroups: community.tagGroups, tags: community.tags, tagSongs, aliases }
}