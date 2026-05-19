import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'

type SheetLinkTarget = {
  songId: string
  type: TypeEnum
  difficulty: DifficultyEnum | string
}

export const buildSheetPath = (sheet: SheetLinkTarget): string =>
  `/songs/${encodeURIComponent(sheet.songId)}/${encodeURIComponent(sheet.type)}/${encodeURIComponent(sheet.difficulty)}`

export const buildSheetLink = (
  sheet: SheetLinkTarget,
  origin = typeof window === 'undefined' ? 'https://dxrating.net' : window.location.origin,
): string => {
  const url = new URL(buildSheetPath(sheet), origin)
  return url.toString()
}