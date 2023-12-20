export namespace DXDataOriginal {
  export interface Root {
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

  export type CategoryEnum =
    | "POPS＆アニメ"
    | "niconico＆ボーカロイド"
    | "ゲーム＆バラエティ"
    | "宴会場"
    | "maimai"
    | "東方Project"
    | "オンゲキ＆CHUNITHM";

  export interface DifficultyElement {
    difficulty: DifficultyEnum;
    name: string;
    color: string;
  }

  export type DifficultyEnum =
    | "basic"
    | "advanced"
    | "expert"
    | "master"
    | "remaster"
    | "【協】"
    | "【即】"
    | "【宴】"
    | "【覚】"
    | "【星】"
    | "【蛸】"
    | "【逆】"
    | "【撫】"
    | "【耐】"
    | "【蔵】"
    | "【傾】"
    | "【光】"
    | "【狂】";

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
    internalId?: number;
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

  export type TypeEnum = "std" | "dx" | "utage";

  export type VersionEnum =
    | "ORANGE PLUS"
    | "ORANGE"
    | "MURASAKi"
    | "MURASAKi PLUS"
    | "MiLK"
    | "maimaiでらっくす"
    | "maimaiでらっくす PLUS"
    | "Splash"
    | "Splash PLUS"
    | "maimai"
    | "GreeN"
    | "GreeN PLUS"
    | "maimai PLUS"
    | "PiNK PLUS"
    | "PiNK"
    | "MiLK PLUS"
    | "FiNALE"
    | "UNiVERSE"
    | "UNiVERSE PLUS"
    | "FESTiVAL"
    | "FESTiVAL PLUS"
    | "BUDDiES";

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
}
