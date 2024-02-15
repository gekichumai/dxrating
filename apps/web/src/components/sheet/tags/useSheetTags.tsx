import { PostgrestSingleResponse } from "@supabase/supabase-js";
import { useMemo } from "react";
import useSWR from "swr";
import { supabase } from "../../../models/supabase";
import { FlattenedSheet } from "../../../songs";

export const useSheetTags = (sheet: FlattenedSheet) => {
  const { data, ...rest } = useSWR(`supabase:tags:${sheet.id}`, async () =>
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
  const assumedData = data as
    | PostgrestSingleResponse<
        {
          tag: {
            id: number;
            localized_name: Record<string, string>;
            localized_description: Record<string, string>;
            group: {
              id: number;
              localized_name: Record<string, string>;
              color: string;
            } | null;
          };
        }[]
      >
    | undefined;
  return useMemo(() => {
    return {
      data: assumedData?.data?.map(({ tag }) => tag),
      ...rest,
    };
  }, [data]);
};
