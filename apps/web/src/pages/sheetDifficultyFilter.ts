import { type DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'

export const sheetMatchesDifficultyFilter = (
  sheet: { type: TypeEnum; difficulty: string },
  difficulties: readonly DifficultyEnum[] | undefined,
) => {
  if (sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P) {
    return true
  }

  if (difficulties === null || difficulties === undefined) {
    return true
  }

  return difficulties.some((difficulty) => difficulty === sheet.difficulty)
}