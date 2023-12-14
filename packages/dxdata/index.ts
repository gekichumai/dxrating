import dxdataJson from "./dxdata.json";

export const dxdata = dxdataJson as DXData;

export interface DXData {
  songs: Song[];
  categories: CategoryElement[];
  versions: VersionElement[];
  types: TypeElement[];
  difficulties: DifficultyElement[];
  regions: Region[];
  updateTime: string;
}

export interface CategoryElement {
  category: CategoryEnum;
}

export enum CategoryEnum {
  Maimai = "maimai",
  Niconicoボーカロイド = "niconico＆ボーカロイド",
  Popsアニメ = "POPS＆アニメ",
  オンゲキChunithm = "オンゲキ＆CHUNITHM",
  ゲームバラエティ = "ゲーム＆バラエティ",
  宴会場 = "宴会場",
  東方Project = "東方Project",
}

export interface DifficultyElement {
  difficulty: DifficultyEnum;
  name: string;
  color: string;
}

export enum DifficultyEnum {
  Advanced = "advanced",
  Basic = "basic",
  Expert = "expert",
  Master = "master",
  ReMaster = "remaster",
}

export interface Region {
  region: string;
  name: string;
}

export interface Song {
  songId: string;
  searchAcronyms: string[];
  category: CategoryEnum;
  title: string;
  artist: string;
  bpm: number | null;
  imageName: string;
  version: VersionEnum;
  releaseDate: string;
  isNew: boolean;
  isLocked: boolean;
  sheets: Sheet[];
  internalId?: number;
}

export interface Sheet {
  type: TypeEnum;
  difficulty: DifficultyEnum;
  level: string;
  levelValue: number;
  internalLevel: null | string;
  internalLevelValue: number;
  multiverInternalLevelValue?: Record<VersionEnum, number>;
  noteDesigner: null | string;
  noteCounts: NoteCounts;
  regions: Regions;
  isSpecial: boolean;
  version?: VersionEnum;
  comment?: string;
}

export interface NoteCounts {
  tap: number | null;
  hold: number | null;
  slide: number | null;
  touch: number | null;
  break: number | null;
  total: number | null;
}

export interface Regions {
  jp: boolean;
  intl: boolean;
  cn: boolean;
}

export enum TypeEnum {
  DX = "dx",
  STD = "std",
  UTAGE = "utage",
  UTAGE2P = "utage2p",
}

export enum VersionEnum {
  BUDDiES = "BUDDiES",
  FESTiVAL = "FESTiVAL",
  FESTiVALPLUS = "FESTiVAL PLUS",
  FiNALE = "FiNALE",
  GreeN = "GreeN",
  GreeNPLUS = "GreeN PLUS",
  MURASAKi = "MURASAKi",
  MURASAKiPLUS = "MURASAKi PLUS",
  Maimai = "maimai",
  MaimaiPLUS = "maimai PLUS",
  Maimaiでらっくす = "maimaiでらっくす",
  MaimaiでらっくすPLUS = "maimaiでらっくす PLUS",
  MiLK = "MiLK",
  MiLKPLUS = "MiLK PLUS",
  Orange = "ORANGE",
  OrangePlus = "ORANGE PLUS",
  PiNK = "PiNK",
  PiNKPLUS = "PiNK PLUS",
  Splash = "Splash",
  SplashPLUS = "Splash PLUS",
  UNiVERSE = "UNiVERSE",
  UNiVERSEPLUS = "UNiVERSE PLUS",
}

// from https://github.com/zetaraku/arcade-songs-fetch/blob/362f2a1b1a1752074951006cedde06948fb0061a/src/maimai/fetch-intl-versions.ts#L16
export const VERSION_ID_MAP = new Map([
  ["maimai", 0],
  ["maimai PLUS", 1],
  ["GreeN", 2],
  ["GreeN PLUS", 3],
  ["ORANGE", 4],
  ["ORANGE PLUS", 5],
  ["PiNK", 6],
  ["PiNK PLUS", 7],
  ["MURASAKi", 8],
  ["MURASAKi PLUS", 9],
  ["MiLK", 10],
  ["MiLK PLUS", 11],
  ["FiNALE", 12],
  ["maimaiでらっくす", 13],
  ["maimaiでらっくす PLUS", 14],
  ["Splash", 15],
  ["Splash PLUS", 16],
  ["UNiVERSE", 17],
  ["UNiVERSE PLUS", 18],
  ["FESTiVAL", 19],
  ["FESTiVAL PLUS", 20],
  ["BUDDiES", 21],
  //! add further version here !//
]);

export const VERSION_SLUG_MAP = new Map([
  ["maimai", "maimai"],
  ["maimai PLUS", "maimai-plus"],
  ["GreeN", "green"],
  ["GreeN PLUS", "green-plus"],
  ["ORANGE", "orange"],
  ["ORANGE PLUS", "orange-plus"],
  ["PiNK", "pink"],
  ["PiNK PLUS", "pink-plus"],
  ["MURASAKi", "murasaki"],
  ["MURASAKi PLUS", "murasaki-plus"],
  ["MiLK", "milk"],
  ["MiLK PLUS", "milk-plus"],
  ["FiNALE", "finale"],
  ["maimaiでらっくす", "maimaidx"],
  ["maimaiでらっくす PLUS", "maimaidx-plus"],
  ["Splash", "splash"],
  ["Splash PLUS", "splash-plus"],
  ["UNiVERSE", "universe"],
  ["UNiVERSE PLUS", "universe-plus"],
  ["FESTiVAL", "festival"],
  ["FESTiVAL PLUS", "festival-plus"],
  ["BUDDiES", "buddies"],
  //! add further version here !//
]);

export const VERSION_SORT_ORDER = Array.from(VERSION_ID_MAP.entries())
  .sort((a, b) => a[1] - b[1])
  .map((a) => a[0]);

export const MULTIVER_AVAILABLE_MIN_VERSION = VERSION_ID_MAP.get(
  VersionEnum.MaimaiでらっくすPLUS
)!;

export const MULTIVER_AVAILABLE_VERSIONS = Array.from(VERSION_ID_MAP.entries())
  .filter((a) => a[1] >= MULTIVER_AVAILABLE_MIN_VERSION)
  .sort((a, b) => a[1] - b[1])
  .map((a) => a[0]) as VersionEnum[];

export interface TypeElement {
  type: TypeEnum;
  name: string;
  abbr: string;
  iconUrl?: string;
  iconHeight?: number;
}

export interface VersionElement {
  version: VersionEnum;
  abbr: string;
}
