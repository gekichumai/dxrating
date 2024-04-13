import { useMemo } from "react";
import { FlattenedSheet } from "../../../songs";

import compact from "lodash-es/compact";
import { useCombinedTags } from "../../../models/useCombinedTags";

export const useSheetTags = (sheet: FlattenedSheet) => {
  const response = useCombinedTags();
  const { data: combinedTags, ...rest } = response;
  const sheetTags = compact(
    combinedTags?.tagSongs
      .filter(
        (tagSong) =>
          tagSong.song_id === sheet.songId &&
          tagSong.sheet_type === sheet.type &&
          tagSong.sheet_difficulty === sheet.difficulty,
      )
      .map(({ tag_id }) => combinedTags.tags.find((tag) => tag.id === tag_id))
      .map((tag) => ({
        ...tag,
        group: combinedTags.tagGroups.find(
          (group) => group.id === tag?.group_id,
        ),
      })),
  );

  return useMemo(() => {
    return {
      data: sheetTags,
      ...rest,
    };
  }, [response]);
};
