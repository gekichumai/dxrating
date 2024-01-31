import { Chip } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { FC } from "react";
import useSWR from "swr";
import IconMdiTag from "~icons/mdi/tag";
import IconMdiTagPlus from "~icons/mdi/tag-plus";
import { supabase } from "../../models/supabase";
import { FlattenedSheet } from "../../songs";
import { MotionButtonBase, MotionTooltip } from "../../utils/motion";

export const SheetTags: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const id = `${sheet.songId}:${sheet.type}`;
  const { data, isLoading } = useSWR(`supabase:tags:${id}`, async () =>
    supabase
      .from("tag_songs")
      .select(
        "tag_id, tag:tags(id, created_by, localized_name, localized_description)",
      )
      .eq("song_id", sheet.songId)
      .eq("sheet_type", sheet.type),
  );

  const addButton = () => (
    <MotionButtonBase
      key="add"
      layout
      layoutId={`sheet-tags:${id}`}
      className="h-6 border-1 border-solid border-gray-200 rounded-full flex items-center justify-center px-2 cursor-pointer bg-gray-100 hover:bg-gray-200 hover:border-gray-300 active:bg-gray-300 active:border-gray-400 transition"
    >
      <IconMdiTagPlus className="h-4 w-4" />

      <span className="ml-1 text-xs">Add</span>
    </MotionButtonBase>
  );

  const inner = () => {
    if (isLoading || !data?.data) {
      return (
        <MotionButtonBase
          key="pending"
          layout
          layoutId={`sheet-tags:${id}`}
          className="h-6 w-16 bg-gray-200 rounded-full animate-pulse"
          disabled
        />
      );
    }

    if (data.data.length === 0) {
      return addButton();
    }

    return (
      <>
        {data.data?.map((tag) => (
          <MotionTooltip
            {...{
              exit: {
                scale: 0.9,
                opacity: 0,
              },
              initial: {
                scale: 0,
                opacity: 0,
              },
              animate: {
                scale: 1,
                opacity: 1,
              },
              transition: {
                type: "spring",
                stiffness: 500,
                damping: 30,
              },
            }}
            key={tag.tag_id}
            title={JSON.stringify(tag.tag?.localized_description)}
          >
            <Chip
              key={tag.tag_id}
              label={JSON.stringify(tag.tag?.localized_name)}
              size="small"
              color="primary"
            />
          </MotionTooltip>
        ))}
        {addButton()}
      </>
    );
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-1 items-center gap-1">
        <IconMdiTag className="mr-2" />
      </div>

      <motion.div layoutRoot className="flex flex-wrap gap-1">
        <AnimatePresence mode="popLayout">{inner()}</AnimatePresence>
      </motion.div>
    </div>
  );
};
