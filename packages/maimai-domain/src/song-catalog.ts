import { TypeEnum, type Song, type SongCatalogDocument, type VersionEnum } from '@gekichumai/dxdata'
import { isUtageType } from './sheet-identity.ts'
import type {
  LegacySheetIdentity,
  LegacySongIdMap,
  ProviderSheetReference,
  SheetDifficulty,
  SheetIdentity,
  VersionedSheet,
} from './types'

/** The parts of the catalog document a song catalog is built from */
export type SongCatalogSource = Pick<SongCatalogDocument, 'songs' | 'versions'>

export interface SongCatalog {
  version: VersionEnum
  songs: readonly Song[]
  sheets: readonly VersionedSheet[]
  /** The sheet of a public sheet ID (`dsht_…`) */
  getById: (sheetId: string) => VersionedSheet | null
  /** The song of a public song ID (`dsng_…`) */
  getSong: (songId: string) => Song | null
  getByIdentity: (identity: SheetIdentity) => VersionedSheet | null
  resolveReference: (reference: ProviderSheetReference) => VersionedSheet | null
}

export function buildSongCatalog(source: SongCatalogSource, version: VersionEnum): SongCatalog {
  const latestReleaseDateByVersion = buildLatestReleaseDateByVersion(source)
  // Catalogs are cached and shared by every caller, so their sheets are frozen. Shallowly: the nested values are the
  // document's own, and deep-freezing every sheet was a measurable share of the SSR worker's cold start.
  const sheets = Object.freeze(
    source.songs.flatMap((song) =>
      projectSong(song, version, latestReleaseDateByVersion).map((sheet) => Object.freeze(sheet)),
    ),
  )
  return createSongCatalog(version, source.songs, sheets)
}

const catalogCache = new WeakMap<SongCatalogSource, Map<VersionEnum, SongCatalog>>()

/** The song catalog of a document under a version, built once per document and version */
export function getSongCatalog(source: SongCatalogSource, version: VersionEnum): SongCatalog {
  let byVersion = catalogCache.get(source)
  if (!byVersion) {
    byVersion = new Map()
    catalogCache.set(source, byVersion)
  }
  let catalog = byVersion.get(version)
  if (!catalog) {
    catalog = buildSongCatalog(source, version)
    byVersion.set(version, catalog)
  }
  return catalog
}

/**
 * For each game version, the latest known sheet release date (YYYY-MM-DD).
 * Used when a sheet has no releaseDate so sort/order can treat it as among the
 * last songs released in that version (newest-first puts them near the top).
 */
export function buildLatestReleaseDateByVersion(source: SongCatalogSource): Map<string, string> {
  const maxByVersion = new Map<string, string>()

  for (const song of source.songs) {
    for (const sheet of song.sheets) {
      if (!sheet.releaseDate) continue
      const current = maxByVersion.get(sheet.version)
      if (!current || sheet.releaseDate > current) {
        maxByVersion.set(sheet.version, sheet.releaseDate)
      }
    }
  }

  for (const versionMeta of source.versions) {
    if (!maxByVersion.has(versionMeta.version) && versionMeta.releaseDate) {
      maxByVersion.set(versionMeta.version, versionMeta.releaseDate)
    }
  }

  return maxByVersion
}

export function releaseDateToTimestamp(releaseDate: string): number {
  return new Date(`${releaseDate}T06:00:00+09:00`).valueOf()
}

/**
 * Resolve a sort-friendly release timestamp.
 * Prefer the sheet's own releaseDate; if missing, fall back to the latest
 * known release date for that sheet's version.
 */
export function resolveReleaseDateTimestamp(
  releaseDate: string | undefined,
  version: string,
  latestReleaseDateByVersion: ReadonlyMap<string, string>,
): number | null {
  if (releaseDate) {
    return releaseDateToTimestamp(releaseDate)
  }
  const fallback = latestReleaseDateByVersion.get(version)
  return fallback ? releaseDateToTimestamp(fallback) : null
}

export function createSongCatalog(
  version: VersionEnum,
  songs: readonly Song[],
  sheets: readonly VersionedSheet[],
): SongCatalog {
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]))
  const songsById = new Map(songs.map((song) => [song.id, song]))
  const byIdentity = new Map<string, VersionedSheet>()
  const byTitle = new Map<string, VersionedSheet | null>()
  const byInternalId = new Map<string, VersionedSheet>()

  for (const sheet of sheets) {
    byIdentity.set(identityKey(sheet.songId, sheet.type, sheet.difficulty), sheet)
    const key = identityKey(sheet.title, sheet.type, sheet.difficulty)
    byTitle.set(key, byTitle.has(key) ? null : sheet)
    if (sheet.internalId !== undefined) {
      byInternalId.set(internalIdKey(sheet.internalId, sheet.type, sheet.difficulty), sheet)
    }
  }

  const getByIdentity = (identity: SheetIdentity) =>
    byIdentity.get(identityKey(identity.songId, identity.type, identity.difficulty)) ?? null
  const getByTitle = (title: string, type: TypeEnum, difficulty: SheetDifficulty) =>
    byTitle.get(identityKey(title, type, difficulty)) ?? null
  const getByLegacyIdentity = (identity: LegacySheetIdentity, legacySongIds: LegacySongIdMap | undefined) => {
    const songId = legacySongIds?.[identity.legacySongId]
    if (songId) return getByIdentity({ ...identity, songId } as SheetIdentity)
    // A song newer than the map: its legacy ID was its title, which is enough when no other song shares it
    return getByTitle(identity.legacySongId, identity.type, identity.difficulty)
  }

  return {
    version,
    songs,
    sheets,
    getById: (id) => byId.get(id) ?? null,
    getSong: (songId) => songsById.get(songId) ?? null,
    getByIdentity,
    resolveReference: (reference) => {
      switch (reference.kind) {
        case 'identity':
          return getByIdentity(reference.identity)
        case 'title':
          return getByTitle(reference.title, reference.type, reference.difficulty)
        case 'internal-id':
          return byInternalId.get(internalIdKey(reference.internalId, reference.type, reference.difficulty)) ?? null
        case 'legacy':
          return getByLegacyIdentity(reference.identity, reference.legacySongIds)
        case 'provider-music-id': {
          const numericId = parseProviderMusicId(reference.musicId)
          const type = inferProviderMusicType(numericId)
          if (numericId !== null) {
            const sheet = byInternalId.get(internalIdKey(numericId, type, reference.difficulty))
            if (sheet) return sheet
          }

          const mapped = reference.map?.[String(reference.musicId)]
          if (!mapped) return null

          // Map names are legacy song IDs, which name one song even where titles repeat (`Link`)
          const identity = { legacySongId: mapped.name, type, difficulty: reference.difficulty } as LegacySheetIdentity
          const songId = reference.legacySongIds?.[mapped.name]
          if (songId) {
            const sheet = getByIdentity({ ...identity, songId } as SheetIdentity)
            if (sheet) return sheet
          }

          return getByTitle(mapped.name, type, reference.difficulty)
        }
      }
    },
  }
}

function projectSong(
  song: Song,
  version: VersionEnum,
  latestReleaseDateByVersion: ReadonlyMap<string, string>,
): VersionedSheet[] {
  // Copy the song's own fields once; each sheet adds its own, without the song's `sheets` (a sheet listing every
  // sibling made the catalog quadratic in size).
  const { id: songId, sheets: _sheets, version: _songVersion, ...songFields } = song
  return song.sheets.map((sheet) => {
    const identity = { songId, type: sheet.type, difficulty: sheet.difficulty as SheetDifficulty } as SheetIdentity
    const isTypeUtage = isUtageType(sheet.type)

    return {
      ...songFields,
      ...sheet,
      songId,
      identity,
      isTypeUtage,
      isRatingEligible: !isTypeUtage,
      releaseDateTimestamp: resolveReleaseDateTimestamp(sheet.releaseDate, sheet.version, latestReleaseDateByVersion),
      internalLevelValue: sheet.multiverInternalLevelValue?.[version] ?? sheet.internalLevelValue,
    }
  })
}

function identityKey(songKey: string, type: TypeEnum, difficulty: SheetDifficulty): string {
  return `${songKey}\u0000${type}\u0000${difficulty}`
}

function internalIdKey(internalId: number, type: TypeEnum, difficulty: SheetDifficulty): string {
  return `${internalId}\u0000${type}\u0000${difficulty}`
}

function parseProviderMusicId(musicId: string | number): number | null {
  if (typeof musicId === 'number') {
    return Number.isFinite(musicId) && Number.isInteger(musicId) ? musicId : null
  }

  const trimmed = musicId.trim()
  if (!trimmed) return null

  const numericId = Number(trimmed)
  return Number.isFinite(numericId) && Number.isInteger(numericId) ? numericId : null
}

function inferProviderMusicType(numericId: number | null): TypeEnum {
  return numericId !== null && numericId >= 10000 ? TypeEnum.DX : TypeEnum.STD
}