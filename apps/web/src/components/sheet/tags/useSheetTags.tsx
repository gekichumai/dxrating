import { useMemo } from "react";
import useSWR from "swr";
import { supabase } from "../../../models/supabase";
import { FlattenedSheet } from "../../../songs";

import compact from "lodash-es/compact";

export const useSheetTags = (sheet: FlattenedSheet) => {
  const { data, ...rest } = useSWR(`supabase::tags::${sheet.id}`, async () =>
    supabase
      .from("tag_songs")
      .select(
        "tag:tags(id, localized_name, localized_description, group:tag_groups(id, localized_name, color))",
      )
      .eq("song_id", sheet.songId)
      .eq("sheet_type", sheet.type)
      .eq("sheet_difficulty", sheet.difficulty)
      .order("id", { ascending: true, referencedTable: "tag" }),
  );
  const mappedData = data?.data?.map(({ tag }) => tag);

  return useMemo(() => {
    return {
      data: compact(mappedData),
      ...rest,
    };
  }, [data]);
};
