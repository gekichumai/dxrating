import { DifficultyEnum, TypeEnum, dxdata, type Sheet, type Song } from '@gekichumai/dxdata'
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

const parseCookieHeader = (cookieHeader: string | null) => {
  const cookies = new Map<string, string>()
  if (!cookieHeader) return cookies

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (!rawName || rawValue.length === 0) continue

    try {
      cookies.set(rawName, decodeURIComponent(rawValue.join('=')))
    } catch {
      cookies.set(rawName, rawValue.join('='))
    }
  }

  return cookies
}

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

export const buildSearchSeedSheets = (songs: readonly Song[] = dxdata.songs): SearchSeedSheet[] =>
  songs
    .flatMap((song) => song.sheets.map((sheet) => toSearchSeedSheet(song, sheet)))
    .sort(compareSearchSeedSheets)
    .slice(0, SEARCH_SEED_LIMIT)

export const hasActiveFilterLastActiveAtCookie = (cookieHeader: string | null, now = Date.now()) => {
  const value = parseCookieHeader(cookieHeader).get(FILTER_LAST_ACTIVE_AT_COOKIE_NAME)
  if (!value) return false

  const lastActiveAt = Number(value)
  if (!Number.isFinite(lastActiveAt) || lastActiveAt <= 0) return false
  if (lastActiveAt > now + FILTER_LAST_ACTIVE_AT_CLOCK_SKEW) return false

  return now - lastActiveAt < SHEET_SORT_FILTER_TTL
}

export const shouldShowSearchSeed = (search: SearchSeedSearchParams, cookieHeader: string | null, now = Date.now()) =>
  !search.q &&
  !search.songId &&
  !search.type &&
  !search.difficulty &&
  !hasActiveFilterLastActiveAtCookie(cookieHeader, now)

export const serializeFilterLastActiveAtCookie = (lastActiveAt = Date.now()) =>
  `${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=${encodeURIComponent(
    String(lastActiveAt),
  )}; Max-Age=${FILTER_LAST_ACTIVE_AT_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`

export const serializeClearFilterLastActiveAtCookie = () =>
  `${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`