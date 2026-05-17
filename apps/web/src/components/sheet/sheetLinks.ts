import type { FlattenedSheet } from '../../songs'

type SheetLinkTarget = Pick<FlattenedSheet, 'songId' | 'type' | 'difficulty'>

export const buildSheetLink = (
  sheet: SheetLinkTarget,
  origin = typeof window === 'undefined' ? 'https://dxrating.net' : window.location.origin,
): string => {
  const url = new URL(`/songs/${encodeURIComponent(sheet.songId)}`, origin)
  url.searchParams.set('type', sheet.type)
  url.searchParams.set('difficulty', sheet.difficulty)
  return url.toString()
}