import maiData from "./assets/maidata.json";

export interface MaiData {
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
}

export interface Sheet {
  type: TypeEnum;
  difficulty: DifficultyEnum;
  level: string;
  levelValue: number;
  internalLevel: null | string;
  internalLevelValue: number;
  noteDesigner: null | string;
  noteCounts: NoteCounts;
  regions: Regions;
  isSpecial: boolean;
  version?: VersionEnum;
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
  SD = "std",
}

export enum VersionEnum {
  BUDDiES = "BUDDiES",
  FESTIVAL = "FESTiVAL",
  FESTIVALPLUS = "FESTiVAL PLUS",
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
  UNIVERSE = "UNiVERSE",
  UNIVERSEPLUS = "UNiVERSE PLUS",
}

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

export interface FlattenedSheet {
  id: string;
  searchAcronym: string;

  songId: string;
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

  type: TypeEnum;
  difficulty: DifficultyEnum;
  level: string;
  levelValue: number;
  internalLevel: null | string;
  internalLevelValue: number;
  noteDesigner: null | string;
  noteCounts: NoteCounts;
  regions: Regions;
  isSpecial: boolean;
}

const ALLOWED_TYPES = ["dx", "std"];

export const getFlattenedSheets = async (): Promise<FlattenedSheet[]> => {
  const songs = maiData.songs;
  const flattenedSheets = songs.flatMap((song) => {
    return song.sheets
      .filter((sheet) => ALLOWED_TYPES.includes(sheet.type))
      .map((sheet) => ({
        id: `${song.songId}-${sheet.type}-${sheet.difficulty}`,
        searchAcronym: `${song.title} ${sheet.type} ${sheet.difficulty}`,
        ...song,
        ...sheet,
      }));
  });
  return flattenedSheets as FlattenedSheet[];
};
