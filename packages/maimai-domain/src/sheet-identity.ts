import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { SheetIdentity } from './types.js'

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
  if (!songId || !TYPE_VALUES.has(type) || !DIFFICULTY_VALUES.has(difficulty)) return null

  return {
    songId,
    type: type as TypeEnum,
    difficulty: difficulty as DifficultyEnum,
  }
}

export function sameSheetIdentity(a: SheetIdentity, b: SheetIdentity): boolean {
  return a.songId === b.songId && a.type === b.type && a.difficulty === b.difficulty
}