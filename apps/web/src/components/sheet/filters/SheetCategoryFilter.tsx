import { CategoryEnum } from "@gekichumai/dxdata";
import { ButtonBase, Chip } from "@mui/material";
import { FC, useMemo } from "react";
import { Control, useController } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { LongPressCallbackReason, useLongPress } from "use-long-press";
import { GestureHint } from "../../global/GestureHint";
import { SheetSortFilterForm } from "../SheetSortFilter";
import { SheetFilterSection } from "./SheetFilterSection";

const SheetCategoryFilterInputCategory = ({
  category,
  selected,
  onToggle,
  onOnly,
}: {
  category: CategoryEnum;
  selected: boolean;
  onToggle: () => void;
  onOnly: () => void;
}) => {
  const bind = useLongPress(onOnly, {
    threshold: 300,
    captureEvent: true,
    cancelOnMovement: true,
    onCancel: (_, meta) => {
      if (meta.reason === LongPressCallbackReason.CancelledByRelease) {
        onToggle();
      }
    },
  });

  return (
    <ButtonBase
      {...bind()}
      className="rounded-lg overflow-hidden"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onToggle();
        }
      }}
      focusRipple
    >
      <Chip
        label={category}
        color={selected ? "primary" : "default"}
        size="small"
        className="!rounded-lg"
      />
    </ButtonBase>
  );
};

const CATEGORY_ENUMS = Object.values(CategoryEnum);

const SheetCategoryFilterInput = ({
  value,
  onChange,
}: {
  value: CategoryEnum[];
  onChange: (value: CategoryEnum[]) => void;
}) => {
  const allEnums = useMemo(
    () =>
      Object.values(CategoryEnum).map((v) => ({
        id: v,
        selected: value.includes(v),
      })),
    [value],
  );

  return (
    <div className="flex flex-wrap gap-2">
      {allEnums.map((e) => (
        <SheetCategoryFilterInputCategory
          key={e.id}
          category={e.id}
          selected={e.selected}
          onToggle={() => {
            const toggled = !e.selected;

            if (toggled) {
              onChange([...value, e.id]);
            } else {
              if (value.length === 1) {
                onChange([...CATEGORY_ENUMS]);
              } else {
                onChange(value.filter((k) => k !== e.id));
              }
            }
          }}
          onOnly={() => {
            onChange([e.id]);
          }}
        />
      ))}
    </div>
  );
};

export const SheetCategoryFilter: FC<{
  control: Control<SheetSortFilterForm>;
}> = ({ control }) => {
  const { t } = useTranslation(["sheet", "global"]);
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, "filters.categories">({
    control,
    name: "filters.categories",
  });

  return (
    <SheetFilterSection
      title={
        <>
          <div>{t("sheet:filter.category.title")}</div>
          <div className="flex-1" />
          <GestureHint
            gesture="tap"
            description={t("sheet:filter.version.gesture-hint.tap")}
          />
          <GestureHint
            gesture="tap-hold"
            description={t("sheet:filter.version.gesture-hint.tap-hold")}
          />
        </>
      }
    >
      <SheetCategoryFilterInput value={value} onChange={onChange} />
    </SheetFilterSection>
  );
};
