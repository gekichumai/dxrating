import { DifficultyElement, DifficultyEnum } from "@gekichumai/dxdata";
import { ButtonBase, Chip } from "@mui/material";
import { FC, useMemo } from "react";
import { Control, useController } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { LongPressCallbackReason, useLongPress } from "use-long-press";

import { GestureHint } from "../../global/GestureHint";
import { SheetSortFilterForm } from "../SheetSortFilter";

import { SheetFilterSection } from "./SheetFilterSection";

const SheetDifficultyFilterInputDifficulty = ({
  difficulty,
  selected,
  onToggle,
  onOnly,
}: {
  difficulty: DifficultyEnum;
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
        label={difficulty}
        color={selected ? "primary" : "default"}
        size="small"
        className="!rounded-lg"
      />
    </ButtonBase>
  );
};

const SheetDifficultyFilterInput = ({
  value,
  onChange,
}: {
  value: DifficultyEnum[];
  onChange: (value: DifficultyEnum[]) => void;
}) => {
  const allEnums = useMemo(
    () =>
      Object.values(DifficultyEnum).map((k) => ({
        id: k,
        selected: value.includes(k),
      })),
    [value],
  );

  return (
    <div className="flex flex-wrap gap-2">
      {allEnums.map((e) => (
        <SheetDifficultyFilterInputDifficulty
          key={e.id}
          difficulty={e.id}
          selected={e.selected}
          onToggle={() => {
            const toggled = !e.selected;

            if (toggled) {
              onChange([...value, e.id]);
            } else {
              if (value.length === 1) {
                onChange([...allEnums.map((k) => k.id)]);
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

export const SheetDifficultyFilter: FC<{
  control: Control<SheetSortFilterForm>;
}> = ({ control }) => {
  const { t } = useTranslation(["sheet", "global"]);
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, "filters.difficulties">({
    control,
    name: "filters.difficulties",
  });

  return (
    <SheetFilterSection
      title={
        <>
          <div>{t("sheet:filter.difficulty.title")}</div>
          <div className="flex-1" />
          <GestureHint
            gesture="tap"
            description={t("sheet:filter.difficulty.gesture-hint.tap")}
          />
          <GestureHint
            gesture="tap-hold"
            description={t("sheet:filter.difficulty.gesture-hint.tap-hold")}
          />
        </>
      }
    >
      <SheetDifficultyFilterInput value={value} onChange={onChange} />
    </SheetFilterSection>
  );
};