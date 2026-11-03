// Enums, constants and types of the DXRating song catalog. The catalog itself is the document served at
// https://miruku.dxrating.net/api/v1/dxdata (schema: dxdata-assembly-line contracts/song-catalog/v1). Nothing here
// imports catalog data, so client bundles can use these freely; the snapshot the SSR worker renders from lives in
// ./snapshot.ts and must only be imported from server code.

/** The catalog document of the dxdata API (`schemaVersion` 1) */
export interface SongCatalogDocument {
  schemaVersion: 1
  /** When the producer built this catalog (RFC 3339) */
  updatedAt: string
  categories: CategoryElement[]
  versions: VersionElement[]
  types: TypeElement[]
  difficulties: DifficultyElement[]
  servers: CatalogServer[]
  songs: Song[]
  tagGroups: CatalogTagGroup[]
  tags: CatalogTag[]
  tagSongs: CatalogTagSong[]
  aliases: CatalogAlias[]
}

export interface CategoryElement {
  category: CategoryEnum
}

export const CategoryEnum = {
  Popsアニメ: 'POPS＆アニメ',
  Niconicoボーカロイド: 'niconico＆ボーカロイド',
  東方Project: '東方Project',
  ゲームバラエティ: 'ゲーム＆バラエティ',
  Maimai: 'maimai',
  オンゲキChunithm: 'オンゲキ＆CHUNITHM',
  宴会場: '宴会場',
} as const

export type CategoryEnum = (typeof CategoryEnum)[keyof typeof CategoryEnum]

export interface DifficultyElement {
  difficulty: DifficultyEnum
  name: string
  color?: string
}

export const DifficultyEnum = {
  Basic: 'basic',
  Advanced: 'advanced',
  Expert: 'expert',
  Master: 'master',
  ReMaster: 'remaster',
} as const

export type DifficultyEnum = (typeof DifficultyEnum)[keyof typeof DifficultyEnum]

/** The game servers (regions) a sheet can be available on */
export const ServerEnum = {
  JP: 'jp',
  INTL: 'intl',
  USA: 'usa',
  CN: 'cn',
} as const

export type ServerEnum = (typeof ServerEnum)[keyof typeof ServerEnum]

export interface CatalogServer {
  id: ServerEnum
  name: string
}

export interface Song {
  /** Stable public song ID, `dsng_` followed by 10 characters */
  id: string
  category: CategoryEnum
  title: string
  artist: string
  bpm?: number
  imageName: string
  /** The version the song first appeared in */
  version: VersionEnum
  isNew: boolean
  isLocked: boolean
  sheets: Sheet[]
  searchAcronyms: string[]
}

export interface Sheet {
  /** Stable public sheet ID, `dsht_` followed by 10 characters */
  id: string
  type: TypeEnum
  /** A standard difficulty, or the 【…】 label of a Utage sheet */
  difficulty: DifficultyEnum
  level: string
  internalLevelValue: number
  multiverInternalLevelValue?: Partial<Record<VersionEnum, number>>
  noteDesigner?: string
  noteCounts: NoteCounts
  /** The servers the sheet is playable on */
  serverIds: ServerEnum[]
  /** Server-specific values that differ from the sheet's own */
  serverOverrides?: Partial<Record<ServerEnum, ServerOverride>>
  isSpecial: boolean
  version: VersionEnum
  internalId?: number
  releaseDate?: string
  comment?: string
}

export interface ServerOverride {
  level?: string
  levelValue?: number
  version?: VersionEnum
}

/** Note counts of a sheet; a count the catalog does not know is absent */
export interface NoteCounts {
  tap?: number
  hold?: number
  slide?: number
  touch?: number
  break?: number
  total?: number
}

export interface CatalogTagGroup {
  id: number
  localized_name: Record<string, string>
  color: string
}

export interface CatalogTag {
  id: number
  localized_name: Record<string, string>
  localized_description: Record<string, string>
  group_id?: number
}

export interface CatalogTagSong {
  song_id: string
  sheet_id: string
  sheet_type: string
  sheet_difficulty: string
  tag_id: number
}

export interface CatalogAlias {
  song_id: string
  name: string
}

export const TypeEnum = {
  DX: 'dx',
  STD: 'std',
  UTAGE: 'utage',
  UTAGE2P: 'utage2p',
} as const

export type TypeEnum = (typeof TypeEnum)[keyof typeof TypeEnum]

export const VersionEnum = {
  BUDDiES: 'BUDDiES', // 2023.9
  BUDDiESPLUS: 'BUDDiES PLUS', // 2024.3
  PRiSM: 'PRiSM', // 2024.9
  PRiSMPLUS: 'PRiSM PLUS', // 2025.3
  CiRCLE: 'CiRCLE', // 2025.9
  CiRCLEPLUS: 'CiRCLE PLUS', // 2026.3
  MAGiCAL: 'MAGiCAL', // 2026.9
  FESTiVAL: 'FESTiVAL',
  FESTiVALPLUS: 'FESTiVAL PLUS',
  FiNALE: 'FiNALE',
  GreeN: 'GreeN',
  GreeNPLUS: 'GreeN PLUS',
  MURASAKi: 'MURASAKi',
  MURASAKiPLUS: 'MURASAKi PLUS',
  Maimai: 'maimai',
  MaimaiPLUS: 'maimai PLUS',
  Maimaiでらっくす: 'maimaiでらっくす',
  MaimaiでらっくすPLUS: 'maimaiでらっくす PLUS',
  MiLK: 'MiLK',
  MiLKPLUS: 'MiLK PLUS',
  Orange: 'ORANGE',
  OrangePlus: 'ORANGE PLUS',
  PiNK: 'PiNK',
  PiNKPLUS: 'PiNK PLUS',
  Splash: 'Splash',
  SplashPLUS: 'Splash PLUS',
  UNiVERSE: 'UNiVERSE',
  UNiVERSEPLUS: 'UNiVERSE PLUS',
} as const

export type VersionEnum = (typeof VersionEnum)[keyof typeof VersionEnum]

// from https://github.com/zetaraku/arcade-songs-fetch/blob/362f2a1b1a1752074951006cedde06948fb0061a/src/maimai/fetch-intl-versions.ts#L16
export const VERSION_ID_MAP = new Map([
  ['maimai', 0],
  ['maimai PLUS', 1],
  ['GreeN', 2],
  ['GreeN PLUS', 3],
  ['ORANGE', 4],
  ['ORANGE PLUS', 5],
  ['PiNK', 6],
  ['PiNK PLUS', 7],
  ['MURASAKi', 8],
  ['MURASAKi PLUS', 9],
  ['MiLK', 10],
  ['MiLK PLUS', 11],
  ['FiNALE', 12],
  ['maimaiでらっくす', 13],
  ['maimaiでらっくす PLUS', 14],
  ['Splash', 15],
  ['Splash PLUS', 16],
  ['UNiVERSE', 17],
  ['UNiVERSE PLUS', 18],
  ['FESTiVAL', 19],
  ['FESTiVAL PLUS', 20],
  ['BUDDiES', 21],
  ['BUDDiES PLUS', 22],
  ['PRiSM', 23],
  ['PRiSM PLUS', 24],
  ['CiRCLE', 25],
  ['CiRCLE PLUS', 26],
  ['MAGiCAL', 27],
  //! add further version here !//
])

export const VERSION_IDS = Array.from(VERSION_ID_MAP.keys()) as VersionEnum[]

export const VERSION_SLUG_MAP = new Map([
  ['maimai', 'maimai'],
  ['maimai PLUS', 'maimai-plus'],
  ['GreeN', 'green'],
  ['GreeN PLUS', 'green-plus'],
  ['ORANGE', 'orange'],
  ['ORANGE PLUS', 'orange-plus'],
  ['PiNK', 'pink'],
  ['PiNK PLUS', 'pink-plus'],
  ['MURASAKi', 'murasaki'],
  ['MURASAKi PLUS', 'murasaki-plus'],
  ['MiLK', 'milk'],
  ['MiLK PLUS', 'milk-plus'],
  ['FiNALE', 'finale'],
  ['maimaiでらっくす', 'maimaidx'],
  ['maimaiでらっくす PLUS', 'maimaidx-plus'],
  ['Splash', 'splash'],
  ['Splash PLUS', 'splash-plus'],
  ['UNiVERSE', 'universe'],
  ['UNiVERSE PLUS', 'universe-plus'],
  ['FESTiVAL', 'festival'],
  ['FESTiVAL PLUS', 'festival-plus'],
  ['BUDDiES', 'buddies'],
  ['BUDDiES PLUS', 'buddies-plus'],
  ['PRiSM', 'prism'],
  ['PRiSM PLUS', 'prism-plus'],
  ['CiRCLE', 'circle'],
  ['CiRCLE PLUS', 'circle-plus'],
  ['MAGiCAL', 'magical'],
  //! add further version here !//
])

export const VERSION_SORT_ORDER = Array.from(VERSION_ID_MAP.entries())
  .sort((a, b) => a[1] - b[1])
  .map((a) => a[0])

export const MULTIVER_AVAILABLE_MIN_VERSION = VERSION_ID_MAP.get(VersionEnum.MaimaiでらっくすPLUS)!

export const MULTIVER_AVAILABLE_VERSIONS = Array.from(VERSION_ID_MAP.entries())
  .filter((a) => a[1] >= MULTIVER_AVAILABLE_MIN_VERSION)
  .sort((a, b) => a[1] - b[1])
  .map((a) => a[0]) as VersionEnum[]

export interface TypeElement {
  type: TypeEnum
  name: string
  abbr?: string
  iconUrl?: string
  iconHeight?: number
}

export interface VersionElement {
  version: VersionEnum
  abbr?: string
  /** Version launch date (YYYY-MM-DD), when the catalog knows it */
  releaseDate?: string
}