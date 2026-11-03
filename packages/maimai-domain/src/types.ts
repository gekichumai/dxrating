import type { DifficultyEnum, Sheet, Song, TypeEnum } from '@gekichumai/dxdata'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'

export type UtageDifficultyLabel = `【${string}】`
export type SheetDifficulty = DifficultyEnum | UtageDifficultyLabel
export type StandardSheetType = typeof TypeEnum.DX | typeof TypeEnum.STD
export type UtageSheetType = typeof TypeEnum.UTAGE | typeof TypeEnum.UTAGE2P

export interface StandardSheetTypeDifficulty {
  type: StandardSheetType
  difficulty: DifficultyEnum
}

export interface UtageSheetTypeDifficulty {
  type: UtageSheetType
  difficulty: DifficultyEnum | UtageDifficultyLabel
}

export type SheetTypeDifficulty = StandardSheetTypeDifficulty | UtageSheetTypeDifficulty

/** One playable chart: a song (by public song ID, `dsng_…`) with a sheet type and difficulty */
export type SheetIdentity = SheetTypeDifficulty & {
  songId: string
}

/** A chart as named by the retired dxdata.json: its legacy song ID (mostly the title) with type and difficulty */
export type LegacySheetIdentity = SheetTypeDifficulty & {
  legacySongId: string
}

/** Legacy song ID → public song ID (see `@gekichumai/dxdata/legacy-song-ids`) */
export type LegacySongIdMap = Readonly<Record<string, string>>

export type ProviderSheetReference =
  | { kind: 'identity'; identity: SheetIdentity }
  | ({ kind: 'title'; title: string } & SheetTypeDifficulty)
  | ({ kind: 'internal-id'; internalId: number } & SheetTypeDifficulty)
  | {
      kind: 'provider-music-id'
      musicId: string | number
      difficulty: DifficultyEnum
      map?: ProviderMusicIdMap
      /** Resolves map names that are legacy song IDs of songs sharing a title */
      legacySongIds?: LegacySongIdMap
    }
  | { kind: 'legacy'; identity: LegacySheetIdentity; legacySongIds: LegacySongIdMap }

export type ProviderMusicIdMap = Record<string, { name: string; ver?: string }>

/**
 * A sheet viewed under a selected maimai DX version, with the fields of its song. `id` is the public sheet ID
 * (`dsht_…`) and `songId` the public song ID; `version` is the sheet's, and `internalLevelValue` the one of the
 * selected version.
 */
export interface VersionedSheet extends Omit<Song, 'id' | 'sheets' | 'version'>, Omit<Sheet, 'difficulty'> {
  songId: string
  difficulty: SheetDifficulty
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
  /** Public sheet ID (`dsht_…`) */
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