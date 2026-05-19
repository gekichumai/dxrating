import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { SheetIdentity, UtageDifficultyLabel } from './types.js'

export const SHEET_IDENTITY_SEPARATOR = '__dxrt__'

const TYPE_VALUES = new Set<string>(Object.values(TypeEnum))
const DIFFICULTY_VALUES = new Set<string>(Object.values(DifficultyEnum))

export function formatSheetIdentity(identity: SheetIdentity): string {
  return [identity.songId, identity.type, identity.difficulty].join(SHEET_IDENTITY_SEPARATOR)
}

export function parseSheetIdentity(value: string): SheetIdentity | null {
  const parts = value.split(SHEET_IDENTITY_SEPARATOR)
  if (parts.length !== 3) return null

  const [songId, type, difficulty] = parts
  if (!songId || !TYPE_VALUES.has(type) || !isValidDifficultyForType(type as TypeEnum, difficulty)) return null

  const parsedType = type as TypeEnum
  if (isUtageType(parsedType)) {
    return {
      songId,
      type: parsedType,
      difficulty: difficulty as DifficultyEnum | UtageDifficultyLabel,
    }
  }

  return {
    songId,
    type: parsedType as TypeEnum.DX | TypeEnum.STD,
    difficulty: difficulty as DifficultyEnum,
  }
}

export function sameSheetIdentity(a: SheetIdentity, b: SheetIdentity): boolean {
  return a.songId === b.songId && a.type === b.type && a.difficulty === b.difficulty
}

function isValidDifficultyForType(type: TypeEnum, difficulty: string | undefined): difficulty is string {
  if (!difficulty) return false
  if (DIFFICULTY_VALUES.has(difficulty)) return true
  return isUtageType(type) && /^【.+】$/.test(difficulty)
}

function isUtageType(type: TypeEnum): type is TypeEnum.UTAGE | TypeEnum.UTAGE2P {
  return type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P
}