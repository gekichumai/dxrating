import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'

export function getVisibleSongPageSheets<T extends { type: TypeEnum; difficulty: DifficultyEnum | string }>(
  sheets: readonly T[],
  activeType: TypeEnum,
  activeDifficulty: DifficultyEnum | string,
): T[] {
  return sheets.filter((sheet) => sheet.type === activeType && sheet.difficulty === activeDifficulty)
}