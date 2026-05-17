import type { FlattenedSheet } from '../../songs'

type SheetLinkTarget = Pick<FlattenedSheet, 'songId' | 'type' | 'difficulty'>

export const buildSheetPath = (sheet: SheetLinkTarget): string =>
  `/${encodeURIComponent(sheet.songId)}/${encodeURIComponent(sheet.type)}/${encodeURIComponent(sheet.difficulty)}`

export const buildSheetLink = (
  sheet: SheetLinkTarget,
  origin = typeof window === 'undefined' ? 'https://dxrating.net' : window.location.origin,
): string => {
  const url = new URL(buildSheetPath(sheet), origin)
  return url.toString()
}