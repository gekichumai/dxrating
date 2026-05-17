import type { DifficultyEnum, Sheet, Song, TypeEnum } from '@gekichumai/dxdata'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export interface SheetIdentity {
  songId: string
  type: TypeEnum
  difficulty: DifficultyEnum
}

export type ProviderSheetReference =
  | { kind: 'identity'; identity: SheetIdentity }
  | { kind: 'title'; title: string; type: TypeEnum; difficulty: DifficultyEnum }
  | { kind: 'internal-id'; internalId: number; type: TypeEnum; difficulty: DifficultyEnum }
  | { kind: 'provider-music-id'; musicId: string | number; difficulty: DifficultyEnum; map: ProviderMusicIdMap }

export type ProviderMusicIdMap = Record<string, { name: string; ver?: string }>

export interface VersionedSheet extends Song, Sheet {
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