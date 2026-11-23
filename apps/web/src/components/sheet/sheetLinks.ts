import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { DEFAULT_LOCALE, type SupportedLocale, localizePath } from '@/setup/locale'

type SheetLinkTarget = {
  songId: string
  type: TypeEnum
  difficulty: DifficultyEnum | string
}

export const buildSheetPath = (sheet: SheetLinkTarget): string =>
  `/songs/${encodeURIComponent(sheet.songId)}/${encodeURIComponent(sheet.type)}/${encodeURIComponent(sheet.difficulty)}`

/** Path of a chart's tolerance calculator (`/songs/<id>/<type>/<difficulty>/tolerance`) */
export const buildSheetTolerancePath = (sheet: SheetLinkTarget): string => `${buildSheetPath(sheet)}/tolerance`

/** A chart's absolute URL, in a language (`/ja/songs/…`; English unprefixed) */
export const buildSheetLink = (
  sheet: SheetLinkTarget,
  origin = typeof window === 'undefined' ? 'https://dxrating.net' : window.location.origin,
  locale: SupportedLocale = DEFAULT_LOCALE,
): string => {
  const url = new URL(localizePath(buildSheetPath(sheet), locale), origin)
  return url.toString()
}

/** Path of a song's hub page (`/songs/<id>`): every chart of the song in one table */
export const songHubPath = (songId: string): string => `/songs/${encodeURIComponent(songId)}`