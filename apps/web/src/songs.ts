import {
  DifficultyEnum,
  Sheet,
  Song,
  TypeEnum,
  VERSION_ID_MAP,
  VersionEnum,
  dxdata,
} from "@gekichumai/dxdata";
import Fuse from "fuse.js";
import { useMemo } from "react";
import useSWR from "swr";
import {
  useAppContext,
  useAppContextDXDataVersion,
} from "./models/context/useAppContext";

export type FlattenedSheet = Song &
  Sheet & {
    id: string;
    isTypeUtage: boolean;
    isRatingEligible: boolean;
  };

export const canonicalId = (song: Song, sheet: Sheet) => {
  return [song.songId, sheet.type, sheet.difficulty].join("__dxrt__");
};

export const canonicalIdFromParts = (
  songId: string,
  type: TypeEnum,
  difficulty: DifficultyEnum,
) => {
  return [songId, type, difficulty].join("__dxrt__");
};

export const getSongs = (maxVersion: VersionEnum): Song[] => {
  const maxVersionId = VERSION_ID_MAP.get(maxVersion);
  if (maxVersionId === undefined) {
    throw new Error(`Invalid version: ${maxVersion}`);
  }

  return dxdata.songs.filter(
    (v) =>
      (VERSION_ID_MAP.get(v.version) ??
        (console.warn(`Invalid version: ${v.version}`), 0)) <= maxVersionId,
  );
};

export const getFlattenedSheets = async (
  version: VersionEnum,
): Promise<FlattenedSheet[]> => {
  const songs = getSongs(version);
  const flattenedSheets = songs.flatMap((song) => {
    return song.sheets.map((sheet) => {
      const isTypeUtage =
        sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P;
      return {
        ...song,
        ...sheet,
        id: canonicalId(song, sheet),
        searchAcronyms: song.searchAcronyms,
        isTypeUtage,
        isRatingEligible: !isTypeUtage,
        internalLevelValue: sheet.multiverInternalLevelValue
          ? sheet.multiverInternalLevelValue[version] ??
            sheet.internalLevelValue
          : sheet.internalLevelValue,
      };
    });
  });
  return flattenedSheets as FlattenedSheet[];
};

export const useSheets = () => {
  const { version } = useAppContext();
  const appVersion = useAppContextDXDataVersion();
  return useSWR(`dxdata:sheets:${version}`, () =>
    getFlattenedSheets(appVersion),
  );
};

export const useSongs = () => {
  const { version } = useAppContext();
  const appVersion = useAppContextDXDataVersion();
  return useSWR(`dxdata:songs:${version}`, () => getSongs(appVersion));
};

export const useSheetsSearchEngine = () => {
  const { data: songs } = useSongs();
  const { data: sheets } = useSheets();

  const fuseInstance = useMemo(() => {
    return new Fuse(songs ?? [], {
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
      threshold: 0.4,
    });
  }, [songs]);

  const search = (term: string) => {
    const results = fuseInstance.search(term);
    return results.flatMap((result) => {
      return (
        sheets?.filter((sheet) => sheet.songId === result.item.songId) ?? []
      );
    });
  };

  return search;
};

export const useFilteredSheets = (searchTerm: string) => {
  const { data: sheets } = useSheets();
  const search = useSheetsSearchEngine();

  const defaultResults = useMemo(() => {
    return (sheets ?? []).slice().sort((a, b) => {
      return b.internalLevelValue - a.internalLevelValue;
    });
  }, [sheets]);

  return useMemo(() => {
    const start = performance.now();
    const results =
      searchTerm === "" ? defaultResults ?? [] : search(searchTerm);
    const end = performance.now();
    console.log(`Fuse search took ${end - start}ms`);

    return {
      results,
      elapsed: end - start,
    };
  }, [search, searchTerm, defaultResults]);
};

export const formatSheetToString = (sheet: FlattenedSheet) => {
  const { title, type, difficulty, internalLevelValue } = sheet;
  return `${title} [${type} ${difficulty} ${internalLevelValue.toFixed(1)}]`;
};
