import { Chip } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { FC, useMemo } from "react";
import IconMdiTag from "~icons/mdi/tag";
import { FlattenedSheet } from "../../../songs";
import { MotionButtonBase, MotionTooltip } from "../../../utils/motion";
import { useLocalizedMessageTranslation } from "../../../utils/useLocalizedMessageTranslation";
import { Markdown } from "../../global/Markdown";
import { SheetTagsAddButton } from "./SheetTagsAddButton";
import { useSheetTags } from "./useSheetTags";

export const SheetTags: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const localizeMessage = useLocalizedMessageTranslation();
  const { data, isLoading } = useSheetTags(sheet);

  const addButton = useMemo(() => {
    return <SheetTagsAddButton key="add-button" sheet={sheet} />;
  }, [sheet]);

  const inner = () => {
    if (isLoading || !data) {
      return (
        <MotionButtonBase
          key="pending"
          layout
          layoutId={`sheet-tags:${sheet.id}`}
          className="h-6 w-16 bg-gray-200 rounded-lg animate-pulse"
          disabled
        />
      );
    }

    if (data.length === 0) {
      return <>{addButton}</>;
    }

    return (
      <>
        {data?.map((tag) => (
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
            key={tag.id}
            title={
              <Markdown content={localizeMessage(tag.localized_description)} />
            }
            arrow
          >
            <Chip
              key={tag.id}
              label={localizeMessage(tag.localized_name)}
              size="small"
              className="cursor-help px-0.5"
              style={{
                backgroundColor: tag.group?.color,
              }}
            />
          </MotionTooltip>
        ))}

        {addButton}
      </>
    );
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-1 items-center gap-1">
        <IconMdiTag className="mr-1" />
      </div>

      <motion.div layoutRoot className="flex flex-wrap gap-1">
        <AnimatePresence mode="popLayout">{inner()}</AnimatePresence>
      </motion.div>
    </div>
  );
};
