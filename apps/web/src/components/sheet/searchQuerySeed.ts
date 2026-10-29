import { VersionEnum, type SongCatalogDocument } from '@gekichumai/dxdata'
import { getSongCatalog } from '@gekichumai/maimai-domain'
import { createSheetsSearchEngine, getFlattenedSheets, type FlattenedSheet } from '@/songs'
import { buildSheetPath } from './sheetLinks'

export const SEARCH_QUERY_SEED_LIMIT = 20
export const SEARCH_QUERY_MAX_LENGTH = 100

export type SearchQuerySeedSheet = Pick<
  FlattenedSheet,
  | 'songId'
  | 'title'
  | 'artist'
  | 'type'
  | 'difficulty'
  | 'level'
  | 'internalLevelValue'
  | 'imageName'
  | 'version'
  | 'serverIds'
  | 'isLocked'
  | 'isTypeUtage'
> & {
  path: string
}

const toSearchQuerySeedSheet = (sheet: FlattenedSheet): SearchQuerySeedSheet => ({
  songId: sheet.songId,
  title: sheet.title,
  artist: sheet.artist,
  type: sheet.type,
  difficulty: sheet.difficulty,
  level: sheet.level,
  internalLevelValue: sheet.internalLevelValue,
  imageName: sheet.imageName,
  version: sheet.version,
  serverIds: sheet.serverIds,
  isLocked: sheet.isLocked,
  isTypeUtage: sheet.isTypeUtage,
  path: buildSheetPath({ songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty }),
})

const searchEngines = new WeakMap<SongCatalogDocument, Map<VersionEnum, ReturnType<typeof createSheetsSearchEngine>>>()

const getSearchEngine = (document: SongCatalogDocument, version: VersionEnum) => {
  let byVersion = searchEngines.get(document)
  if (!byVersion) {
    byVersion = new Map()
    searchEngines.set(document, byVersion)
  }
  const cachedSearchEngine = byVersion.get(version)
  if (cachedSearchEngine) return cachedSearchEngine

  const searchEngine = createSheetsSearchEngine({
    songs: document.songs,
    sheets: getFlattenedSheets(getSongCatalog(document, version)),
  })
  byVersion.set(version, searchEngine)
  return searchEngine
}

export const buildSearchQuerySeedSheets = (
  query: string,
  document: SongCatalogDocument,
  version: VersionEnum = VersionEnum.MAGiCAL,
): SearchQuerySeedSheet[] => {
  if (query.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new RangeError(`Search query must not exceed ${SEARCH_QUERY_MAX_LENGTH} characters`)
  }
  if (!query.trim()) return []

  return getSearchEngine(document, version)(query).slice(0, SEARCH_QUERY_SEED_LIMIT).map(toSearchQuerySeedSheet)
}