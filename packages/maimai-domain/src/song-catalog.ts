import { TypeEnum, type DXData, type Song, type VersionEnum } from '@gekichumai/dxdata'
import { formatSheetIdentity, parseSheetIdentity } from './sheet-identity.js'
import type { ProviderSheetReference, SheetDifficulty, SheetIdentity, VersionedSheet } from './types.js'

export interface SongCatalog {
  version: VersionEnum
  sheets: readonly VersionedSheet[]
  getById: (id: string) => VersionedSheet | null
  getByIdentity: (identity: SheetIdentity) => VersionedSheet | null
  resolveReference: (reference: ProviderSheetReference) => VersionedSheet | null
}

export type ParsedCatalogSheetId = SheetIdentity

export function buildSongCatalog(data: DXData, version: VersionEnum): SongCatalog {
  const sheets = data.songs.flatMap((song) => projectSong(song, version))
  return createSongCatalog(version, sheets)
}

export function createSongCatalog(version: VersionEnum, sheets: readonly VersionedSheet[]): SongCatalog {
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]))
  const byTitle = new Map<string, VersionedSheet | null>()
  const byInternalId = new Map<string, VersionedSheet>()

  for (const sheet of sheets) {
    const key = titleKey(sheet.title, sheet.type, sheet.difficulty)
    byTitle.set(key, byTitle.has(key) ? null : sheet)
    if (sheet.internalId !== undefined) {
      byInternalId.set(internalIdKey(sheet.internalId, sheet.type, sheet.difficulty), sheet)
    }
  }

  return {
    version,
    sheets,
    getById: (id) => byId.get(id) ?? null,
    getByIdentity: (identity) => byId.get(formatSheetIdentity(identity)) ?? null,
    resolveReference: (reference) => {
      switch (reference.kind) {
        case 'identity':
          return byId.get(formatSheetIdentity(reference.identity)) ?? null
        case 'title':
          return byTitle.get(titleKey(reference.title, reference.type, reference.difficulty)) ?? null
        case 'internal-id':
          return byInternalId.get(internalIdKey(reference.internalId, reference.type, reference.difficulty)) ?? null
        case 'provider-music-id': {
          const numericId = parseProviderMusicId(reference.musicId)
          const type = inferProviderMusicType(numericId)
          if (numericId !== null) {
            const sheet = byInternalId.get(internalIdKey(numericId, type, reference.difficulty))
            if (sheet) return sheet
          }

          const mapped = reference.map?.[String(reference.musicId)]
          if (!mapped) return null

          const sheet = byId.get(formatSheetIdentity(toSheetIdentity(mapped.name, type, reference.difficulty)))
          if (sheet) return sheet

          return byTitle.get(titleKey(mapped.name, type, reference.difficulty)) ?? null
        }
      }
    },
  }
}

function projectSong(song: Song, version: VersionEnum): VersionedSheet[] {
  return song.sheets.map((sheet) => {
    const identity = toSheetIdentity(song.songId, sheet.type, sheet.difficulty as SheetDifficulty)
    const isTypeUtage = sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P

    return {
      ...song,
      ...sheet,
      id: formatSheetIdentity(identity),
      identity,
      isTypeUtage,
      isRatingEligible: !isTypeUtage,
      releaseDateTimestamp: sheet.releaseDate ? new Date(`${sheet.releaseDate}T06:00:00+09:00`).valueOf() : null,
      internalLevelValue: sheet.multiverInternalLevelValue?.[version] ?? sheet.internalLevelValue,
    }
  })
}

function titleKey(title: string, type: TypeEnum, difficulty: SheetDifficulty): string {
  return `${title}\u0000${type}\u0000${difficulty}`
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

function toSheetIdentity(songId: string, type: TypeEnum, difficulty: SheetDifficulty): SheetIdentity {
  return {
    songId,
    type,
    difficulty,
  } as SheetIdentity
}

export function getSheetIdentityFromId(id: string): SheetIdentity | null {
  return parseSheetIdentity(id)
}