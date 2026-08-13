import { VersionEnum, dxdata } from '@gekichumai/dxdata'
import { createSheetsSearchEngine, getFlattenedSheetsForVersion, type FlattenedSheet } from '@/songs'
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
  | 'regions'
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
  regions: sheet.regions,
  isLocked: sheet.isLocked,
  isTypeUtage: sheet.isTypeUtage,
  path: buildSheetPath({ songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty }),
})

const searchEngines = new Map<VersionEnum, ReturnType<typeof createSheetsSearchEngine>>()

const getSearchEngine = (version: VersionEnum) => {
  const cachedSearchEngine = searchEngines.get(version)
  if (cachedSearchEngine) return cachedSearchEngine

  const searchEngine = createSheetsSearchEngine({
    songs: dxdata.songs,
    sheets: getFlattenedSheetsForVersion(version),
  })
  searchEngines.set(version, searchEngine)
  return searchEngine
}

export const buildSearchQuerySeedSheets = (
  query: string,
  version: VersionEnum = VersionEnum.CiRCLEPLUS,
): SearchQuerySeedSheet[] => {
  if (query.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new RangeError(`Search query must not exceed ${SEARCH_QUERY_MAX_LENGTH} characters`)
  }
  if (!query.trim()) return []

  return getSearchEngine(version)(query).slice(0, SEARCH_QUERY_SEED_LIMIT).map(toSearchQuerySeedSheet)
}