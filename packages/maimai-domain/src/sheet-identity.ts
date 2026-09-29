import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { SheetIdentity, UtageDifficultyLabel } from './types'

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
  if (songId === '' || !isSheetType(type)) return null

  if (isUtageType(type) && isUtageDifficulty(difficulty)) {
    return { songId, type, difficulty }
  }
  if (!isStandardDifficulty(difficulty)) return null
  return { songId, type, difficulty }
}

export function sameSheetIdentity(a: SheetIdentity, b: SheetIdentity): boolean {
  return a.songId === b.songId && a.type === b.type && a.difficulty === b.difficulty
}

function isSheetType(value: string): value is TypeEnum {
  return TYPE_VALUES.has(value)
}

export function isStandardDifficulty(value: string): value is DifficultyEnum {
  return DIFFICULTY_VALUES.has(value)
}

function isUtageDifficulty(value: string): value is UtageDifficultyLabel {
  return /^【.+】$/.test(value)
}

function isUtageType(type: TypeEnum): type is typeof TypeEnum.UTAGE | typeof TypeEnum.UTAGE2P {
  return type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P
}