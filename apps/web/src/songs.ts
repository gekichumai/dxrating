import {
  CategoryEnum,
  DifficultyEnum,
  NoteCounts,
  Regions,
  Sheet,
  Song,
  TypeEnum,
  VersionEnum,
  dxdata,
} from "@gekichumai/dxdata";
import Fuse from "fuse.js";
import { useMemo } from "react";
import useSWR from "swr";

export interface FlattenedSheet {
  id: string;
  searchAcronyms: string[];

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

const canonicalId = (song: Song, sheet: Sheet) => {
  return [song.songId, sheet.type, sheet.difficulty].join("__dxrt__");
};

export const getFlattenedSheets = async (): Promise<FlattenedSheet[]> => {
  const songs = dxdata.songs as Song[];
  const flattenedSheets = songs.flatMap((song) => {
    return song.sheets
      .filter((sheet) => ALLOWED_TYPES.includes(sheet.type))
      .map((sheet) => ({
        ...song,
        ...sheet,
        id: canonicalId(song, sheet),
        searchAcronyms: song.searchAcronyms,
      }));
  });
  return flattenedSheets as FlattenedSheet[];
};

export const useSheets = () => {
  return useSWR("sheets", getFlattenedSheets);
};

export const useSheetsFuse = () => {
  const { data: sheets } = useSheets();

  const fuseInstance = useMemo(() => {
    return new Fuse(sheets ?? [], {
      keys: [
        {
          name: "searchAcronyms",
          weight: 2,
        },
        {
          name: "title",
          weight: 1,
        },
      ],
      shouldSort: true,
    });
  }, [sheets]);

  return fuseInstance;
};

export const useFilteredSheets = (searchTerm: string) => {
  const { data: sheets } = useSheets();
  const fuseInstance = useSheetsFuse();

  return useMemo(() => {
    const start = performance.now();
    const results =
      searchTerm === ""
        ? sheets?.map((sheet, i) => ({
            item: sheet as FlattenedSheet,
            refIndex: i,
          })) ?? []
        : fuseInstance.search(searchTerm);
    const end = performance.now();
    console.log(`Fuse search took ${end - start}ms:`, results);

    return {
      results,
      elapsed: end - start,
    };
  }, [fuseInstance, searchTerm, sheets]);
};

export const formatSheetToString = (sheet: FlattenedSheet) => {
  const { title, type, difficulty, internalLevelValue } = sheet;
  return `${title} [${type} ${difficulty} ${internalLevelValue.toFixed(1)}]`;
};
