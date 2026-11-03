import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { LegacySheetIdentity, SheetIdentity, UtageDifficultyLabel } from './types'

const PUBLIC_ID_ALPHABET = '23456789abcdefghjkmnpqrstvwxyz'
const PUBLIC_SONG_ID_PATTERN = new RegExp(`^dsng_[${PUBLIC_ID_ALPHABET}]{10}$`)
const PUBLIC_SHEET_ID_PATTERN = new RegExp(`^dsht_[${PUBLIC_ID_ALPHABET}]{10}$`)

export const isPublicSongId = (value: string): boolean => PUBLIC_SONG_ID_PATTERN.test(value)
export const isPublicSheetId = (value: string): boolean => PUBLIC_SHEET_ID_PATTERN.test(value)

/** Separator of the legacy sheet ID `<legacy song ID>__dxrt__<type>__dxrt__<difficulty>` */
export const LEGACY_SHEET_ID_SEPARATOR = '__dxrt__'

const TYPE_VALUES = new Set<string>(Object.values(TypeEnum))
const DIFFICULTY_VALUES = new Set<string>(Object.values(DifficultyEnum))

export function formatLegacySheetId(identity: LegacySheetIdentity): string {
  return [identity.legacySongId, identity.type, identity.difficulty].join(LEGACY_SHEET_ID_SEPARATOR)
}

/** Parses a legacy sheet ID, as saved by DXRating before it moved to public sheet IDs */
export function parseLegacySheetId(value: string): LegacySheetIdentity | null {
  const parts = value.split(LEGACY_SHEET_ID_SEPARATOR)
  if (parts.length !== 3) return null

  const [legacySongId, type, difficulty] = parts
  if (!legacySongId || !TYPE_VALUES.has(type) || !isValidDifficultyForType(type as TypeEnum, difficulty)) return null

  return { legacySongId, type, difficulty } as LegacySheetIdentity
}

export function sameSheetIdentity(a: SheetIdentity, b: SheetIdentity): boolean {
  return a.songId === b.songId && a.type === b.type && a.difficulty === b.difficulty
}

export function isUtageType(type: string): type is typeof TypeEnum.UTAGE | typeof TypeEnum.UTAGE2P {
  return type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P
}

function isValidDifficultyForType(type: TypeEnum, difficulty: string | undefined): difficulty is string {
  if (!difficulty) return false
  if (DIFFICULTY_VALUES.has(difficulty)) return true
  return isUtageType(type) && /^【.+】$/.test(difficulty)
}

export type { UtageDifficultyLabel }