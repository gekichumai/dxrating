import useSWR from "swr";

import { supabase } from "./supabase";
import { Json } from "./supabase.types";

export interface CombinedTags {
  tags: Tag[];
  tagGroups: TagGroup[];
  tagSongs: TagSong[];
}

export interface TagGroup {
  id: number;
  localized_name: Json;
  color: string;
}

export interface TagSong {
  song_id: string;
  sheet_type: string;
  sheet_difficulty: string;
  tag_id: number;
}

export interface Tag {
  id: number;
  localized_name: Json;
  localized_description: Json;
  group_id: number;
}

export const useCombinedTags = () => {
  return useSWR(
    "supabase::functions::combined-tags",
    async () => {
      const { data, error } = await supabase.functions.invoke("combined-tags");
      if (error) {
        throw error;
      }
      return data as CombinedTags;
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
      suspense: false,
    },
  );
};
