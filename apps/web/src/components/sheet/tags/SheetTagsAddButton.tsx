import { Chip, Dialog, Grow } from "@mui/material";
import { FC, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import IconMdiTagPlus from "~icons/mdi/tag-plus";
import { supabase } from "../../../models/supabase";
import { FlattenedSheet } from "../../../songs";
import { formatErrorMessage } from "../../../utils/formatErrorMessage";
import { MotionButtonBase, MotionTooltip } from "../../../utils/motion";
import { zoomTransitions } from "../../../utils/motionConstants";
import { useLocalizedMessageTranslation } from "../../../utils/useLocalizedMessageTranslation";
import { Markdown } from "../../global/Markdown";
import { SheetListItemContent } from "../SheetListItem";
import { useSheetTags } from "./useSheetTags";

import clsx from "clsx";
import { deriveColor } from "../../../utils/color";

const SheetTagsAddDialog: FC<{
  sheet: FlattenedSheet;
}> = ({ sheet }) => {
  const { t } = useTranslation(["sheet"]);
  const [pending, setPending] = useState(false);
  const localizeMessage = useLocalizedMessageTranslation();
  const { data: tagGroups, isLoading: loadingTags } = useSWR(
    "supabase::tag_grouped",
    async () => {
      const { data } = await supabase
        .from("tags")
        .select(
          "id, localized_name, localized_description, group:tag_groups(id, localized_name, color)",
        )
        .order("id", { ascending: true });

      if (!data) {
        return null;
      }

      const grouped = data.reduce(
        (acc, tag) => {
          if (!tag.group?.id) {
            return acc;
          }

          if (!acc[tag.group.id]) {
            acc[tag.group.id] = [];
          }

          if (acc[tag.group.id]) {
            acc[tag.group.id].push(tag);
          }

          return acc;
        },
        {} as Record<number, typeof data>,
      );

      return Object.entries(grouped).map(([, tags]) => ({
        group: tags[0].group,
        tags,
      }));
    },
  );
  const {
    data: existingTags,
    isLoading: loadingExistingTags,
    mutate: mutateExistingTags,
  } = useSheetTags(sheet);

  const existingTagsIDList = existingTags?.map(({ id }) => id) ?? [];

  const addTag = async (tagId: number) => {
    setPending(true);
    try {
      const result = await supabase
        .from("tag_songs")
        .upsert({
          song_id: sheet.songId,
          sheet_type: sheet.type,
          sheet_difficulty: sheet.difficulty,
          tag_id: tagId,
        })
        .eq("song_id", sheet.songId)
        .eq("sheet_type", sheet.type)
        .eq("sheet_difficulty", sheet.difficulty);
      if (result.error) {
        throw result.error;
      }

      toast.success(t("sheet:tags.add.toast-success"), {
        id: `tag-add-success:${tagId}`,
      });
      mutateExistingTags();
    } catch (error) {
      console.error("Failed to add tag", error);

      toast.error(
        t("sheet:tags.add.toast-failed", { error: formatErrorMessage(error) }),
        {
          id: `tag-add-failed:${tagId}`,
        },
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="text-lg font-bold">{t("sheet:tags.add.title")}</div>
      <div className="text-lg">
        <SheetListItemContent sheet={sheet} />
      </div>

      <div className="h-px w-full bg-gray-2 mt-1 mb-2" />
      <div className="flex flex-wrap gap-2">
        {loadingTags || loadingExistingTags ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Chip
              key={i}
              color="primary"
              disabled
              className="rounded-lg animate-pulse w-16"
            />
          ))
        ) : (
          <div className="flex flex-col gap-2">
            {tagGroups?.map(({ group, tags }) => (
              <div key={group?.id} className="flex gap-1 items-center">
                <div className="flex items-center">
                  <div className="text-base py-1 whitespace-nowrap">
                    {localizeMessage(group?.localized_name)}
                  </div>
                  <div className="w-px h-7 bg-gray-2 shrink-0 ml-2" />
                </div>
                <div className="flex flex-wrap gap-1 grow ml-2">
                  {tags.map((tag) => {
                    const exists = existingTagsIDList.includes(tag.id);

                    return (
                      <MotionTooltip
                        {...zoomTransitions}
                        key={tag.id}
                        title={
                          <Markdown
                            content={localizeMessage(tag.localized_description)}
                          />
                        }
                        arrow
                        slotProps={{
                          popper: {
                            modifiers: [
                              {
                                name: "offset",
                                options: {
                                  offset: [0, -8],
                                },
                              },
                            ],
                          },
                        }}
                      >
                        <Chip
                          key={tag.id}
                          label={localizeMessage(tag.localized_name)}
                          onClick={() => addTag(tag.id)}
                          disabled={pending || exists}
                          className={clsx(
                            "rounded-lg border border-solid",
                            pending && "animate-pulse -animate-delay-1000",
                          )}
                          style={{
                            backgroundColor: tag.group?.color,
                            borderColor: deriveColor(
                              tag.group?.color ?? "#000",
                              "border",
                            ),
                          }}
                        />
                      </MotionTooltip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const SheetTagsAddButton: FC<{ sheet: FlattenedSheet }> = ({
  sheet,
}) => {
  const { t } = useTranslation(["sheet"]);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        TransitionComponent={Grow}
      >
        <SheetTagsAddDialog sheet={sheet} />
      </Dialog>

      <MotionButtonBase
        // {...zoomTransitions}
        className="h-6 border-1 border-solid border-gray-200 rounded-lg flex items-center justify-center px-2 cursor-pointer bg-gray-100 hover:bg-gray-200 hover:border-gray-300 active:bg-gray-300 active:border-gray-400 transition"
        onClick={() => {
          setOpen(true);
        }}
      >
        <IconMdiTagPlus className="h-4 w-4" />

        <span className="ml-1 text-xs">{t("sheet:tags.add.button")}</span>
      </MotionButtonBase>
    </>
  );
};
