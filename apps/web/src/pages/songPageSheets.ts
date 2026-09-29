import type { TypeEnum } from '@gekichumai/dxdata'

export function getVisibleSongPageSheets<T extends { type: TypeEnum; difficulty: string }>(
  sheets: readonly T[],
  activeType: TypeEnum,
  activeDifficulty: string,
): T[] {
  return sheets.filter((sheet) => sheet.type === activeType && sheet.difficulty === activeDifficulty)
}