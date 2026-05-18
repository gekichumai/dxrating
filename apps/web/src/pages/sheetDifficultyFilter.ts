import { type DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'

export const sheetMatchesDifficultyFilter = (
  sheet: { type: TypeEnum; difficulty: DifficultyEnum | string },
  difficulties: readonly DifficultyEnum[] | undefined,
) => {
  if (sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P) {
    return true
  }

  if (!difficulties) {
    return true
  }

  return difficulties.includes(sheet.difficulty as DifficultyEnum)
}