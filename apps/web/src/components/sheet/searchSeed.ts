import { DifficultyEnum, TypeEnum, dxdata, type Sheet, type Song } from '@gekichumai/dxdata'
import { serialize } from 'cookie'
import { parseCookieHeader } from '@/utils/cookies'
import { buildSheetPath } from './sheetLinks'

export const SHEET_SORT_FILTER_TTL = 5 * 60 * 1000
export const FILTER_LAST_ACTIVE_AT_COOKIE_NAME = 'filterLastActiveAt'
const FILTER_LAST_ACTIVE_AT_COOKIE_MAX_AGE_SECONDS = SHEET_SORT_FILTER_TTL / 1000
const FILTER_LAST_ACTIVE_AT_CLOCK_SKEW = 30 * 1000
export const SEARCH_SEED_LIMIT = 500

export type SearchSeedSheet = {
  songId: string
  title: string
  type: TypeEnum
  difficulty: DifficultyEnum
  level: string
  internalLevelValue: number
  releaseDate?: string
  path: string
}

type SearchSeedSearchParams = {
  q?: string
  songId?: string
  type?: string
  difficulty?: string
}

const typeOrder = Object.values(TypeEnum)
const difficultyOrder = Object.values(DifficultyEnum)

const releaseDateTimestamp = (releaseDate: string | undefined) => {
  if (!releaseDate) return 0
  const timestamp = new Date(`${releaseDate}T00:00:00Z`).valueOf()
  return Number.isFinite(timestamp) ? timestamp : 0
}

const compareSearchSeedSheets = (a: SearchSeedSheet, b: SearchSeedSheet) => {
  const releaseDateComparison = releaseDateTimestamp(b.releaseDate) - releaseDateTimestamp(a.releaseDate)
  if (releaseDateComparison !== 0) return releaseDateComparison

  const titleComparison = a.title.localeCompare(b.title)
  if (titleComparison !== 0) return titleComparison

  const typeComparison = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
  if (typeComparison !== 0) return typeComparison

  return difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty)
}

const toSearchSeedSheet = (song: Song, sheet: Sheet): SearchSeedSheet => ({
  songId: song.songId,
  title: song.title,
  type: sheet.type,
  difficulty: sheet.difficulty,
  level: sheet.level,
  internalLevelValue: sheet.internalLevelValue,
  releaseDate: sheet.releaseDate,
  path: buildSheetPath({ songId: song.songId, type: sheet.type, difficulty: sheet.difficulty }),
})

const createSearchSeedSheets = (songs: readonly Song[]): SearchSeedSheet[] =>
  songs
    .flatMap((song) => song.sheets.map((sheet) => toSearchSeedSheet(song, sheet)))
    .sort(compareSearchSeedSheets)
    .slice(0, SEARCH_SEED_LIMIT)

let defaultSearchSeedSheets: SearchSeedSheet[] | null = null

export const buildSearchSeedSheets = (songs?: readonly Song[]): SearchSeedSheet[] => {
  if (songs) return createSearchSeedSheets(songs)

  defaultSearchSeedSheets ??= createSearchSeedSheets(dxdata.songs)
  return defaultSearchSeedSheets.slice()
}

export const hasActiveFilterLastActiveAtCookie = (cookieHeader: string | null, now = Date.now()) => {
  const value = parseCookieHeader(cookieHeader)[FILTER_LAST_ACTIVE_AT_COOKIE_NAME]
  if (!value) return false

  const lastActiveAt = Number(value)
  if (!Number.isFinite(lastActiveAt) || lastActiveAt <= 0) return false
  if (lastActiveAt > now + FILTER_LAST_ACTIVE_AT_CLOCK_SKEW) return false

  return now - lastActiveAt < SHEET_SORT_FILTER_TTL
}

export const shouldShowSearchSeed = (search: SearchSeedSearchParams, hasActiveFilterLastActiveAt = false) =>
  !search.q && !search.songId && !search.type && !search.difficulty && !hasActiveFilterLastActiveAt

export const serializeFilterLastActiveAtCookie = (lastActiveAt = Date.now()) =>
  serialize(FILTER_LAST_ACTIVE_AT_COOKIE_NAME, String(lastActiveAt), {
    maxAge: FILTER_LAST_ACTIVE_AT_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
  })

export const serializeClearFilterLastActiveAtCookie = () =>
  serialize(FILTER_LAST_ACTIVE_AT_COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
  })