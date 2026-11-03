import { DifficultyEnum, ServerEnum, TypeEnum } from '@gekichumai/dxdata'

/** The order regional availability badges are shown in */
export const SERVER_BADGE_ORDER = [ServerEnum.JP, ServerEnum.INTL, ServerEnum.USA, ServerEnum.CN] as const

export const TYPE_ORDER = [TypeEnum.DX, TypeEnum.STD, TypeEnum.UTAGE, TypeEnum.UTAGE2P] as const

export const DIFFICULTY_ORDER = [
  DifficultyEnum.ReMaster,
  DifficultyEnum.Master,
  DifficultyEnum.Expert,
  DifficultyEnum.Advanced,
  DifficultyEnum.Basic,
] as const

export function getHighestDifficulty(sheets: { difficulty: DifficultyEnum }[]): DifficultyEnum {
  const diffSet = new Set(sheets.map((s) => s.difficulty))
  return DIFFICULTY_ORDER.find((d) => diffSet.has(d)) ?? DifficultyEnum.Master
}