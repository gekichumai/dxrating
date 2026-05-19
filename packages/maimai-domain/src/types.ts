import type { DifficultyEnum, Sheet, Song, TypeEnum } from '@gekichumai/dxdata'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export type UtageDifficultyLabel = `【${string}】`
export type SheetDifficulty = DifficultyEnum | UtageDifficultyLabel
export type StandardSheetType = TypeEnum.DX | TypeEnum.STD
export type UtageSheetType = TypeEnum.UTAGE | TypeEnum.UTAGE2P

export interface StandardSheetTypeDifficulty {
  type: StandardSheetType
  difficulty: DifficultyEnum
}

export interface UtageSheetTypeDifficulty {
  type: UtageSheetType
  difficulty: DifficultyEnum | UtageDifficultyLabel
}

export type SheetTypeDifficulty = StandardSheetTypeDifficulty | UtageSheetTypeDifficulty

export type SheetIdentity = SheetTypeDifficulty & {
  songId: string
}

export type ProviderSheetReference =
  | { kind: 'identity'; identity: SheetIdentity }
  | ({ kind: 'title'; title: string } & SheetTypeDifficulty)
  | ({ kind: 'internal-id'; internalId: number } & SheetTypeDifficulty)
  | { kind: 'provider-music-id'; musicId: string | number; difficulty: DifficultyEnum; map?: ProviderMusicIdMap }

export type ProviderMusicIdMap = Record<string, { name: string; ver?: string }>

export interface VersionedSheet extends Omit<Song, 'sheets'>, Omit<Sheet, 'difficulty'> {
  sheets: Sheet[]
  difficulty: SheetDifficulty
  id: string
  identity: SheetIdentity
  isTypeUtage: boolean
  isRatingEligible: boolean
  releaseDateTimestamp: number | null
}

export type ImportProvider = 'lxns' | 'maimai-net' | 'diving-fish' | 'aqua-dx' | 'mu-net' | 'aqua-sqlite'

export type Best50Bucket = 'b15' | 'b35'

export type ComboFlag = 'fc' | 'fcp' | 'ap' | 'app' | null
export type SyncFlag = 'fs' | 'fsp' | 'fsd' | 'fsdp' | 'sync' | null

export interface RatingEntry {
  sheetId: string
  identity: SheetIdentity
  achievementRate: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
  source?: {
    provider: ImportProvider
    providerId?: string | number
    providerSongName?: string
    best50Bucket?: Best50Bucket
  }
}

export interface ImportWarning {
  provider: ImportProvider
  code: 'sheet-not-found' | 'invalid-difficulty' | 'invalid-type' | 'invalid-achievement'
  message: string
  row: unknown
}