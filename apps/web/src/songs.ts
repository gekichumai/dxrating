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
import { supabase } from "./models/supabase";

const CANONICAL_ID_PARTS_SEPARATOR = "__dxrt__";

export type FlattenedSheet = Song &
  Sheet & {
    id: string;
    isTypeUtage: boolean;
    isRatingEligible: boolean;
    tags: number[];
  };

export const canonicalId = (song: Song, sheet: Sheet) => {
  return [song.songId, sheet.type, sheet.difficulty].join(
    CANONICAL_ID_PARTS_SEPARATOR,
  );
};

export const canonicalIdFromParts = (
  songId: string,
  type: TypeEnum,
  difficulty: DifficultyEnum,
) => {
  return [songId, type, difficulty].join(CANONICAL_ID_PARTS_SEPARATOR);
};

export const getSongs = (maxVersion: VersionEnum): Song[] => {
  const maxVersionId = VERSION_ID_MAP.get(maxVersion);
  if (maxVersionId === undefined) {
    throw new Error(`Invalid version: ${maxVersion}`);
  }

  return dxdata.songs.filter((v) =>
    v.sheets.some(
      (sheet) =>
        (VERSION_ID_MAP.get(sheet.version) ??
          (console.warn(`Invalid version: ${sheet.version}`), 0)) <=
        maxVersionId,
    ),
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
  return useSWR(`dxdata:sheets:${version}`, async () => {
    const [relations, sheets] = await Promise.all([
      supabase
        .from("tag_songs")
        .select("song_id, sheet_type, sheet_difficulty, tag_id"),
      getFlattenedSheets(appVersion),
    ]);

    if (!relations.data) {
      return sheets.map((sheet) => ({
        ...sheet,
        tags: [],
      }));
    }

    const map = new Map<string, number[]>();
    for (const relation of relations.data) {
      const canonical = canonicalIdFromParts(
        relation.song_id,
        relation.sheet_type,
        relation.sheet_difficulty,
      );
      const tags = map.get(canonical) ?? [];
      tags.push(relation.tag_id);
      map.set(canonical, tags);
    }

    return sheets.map((sheet) => ({
      ...sheet,
      tags: map.get(sheet.id) ?? [],
    }));
  });
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
    return new Fuse(
      songs?.map((song) => ({
        ...song,
        searchAcronyms: song.searchAcronyms.filter(
          (acronym) => acronym.length < 50,
        ),
      })) ?? [],
      {
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
      },
    );
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
