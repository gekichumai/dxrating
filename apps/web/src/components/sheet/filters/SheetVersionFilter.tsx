import { VERSION_IDS, VersionEnum } from "@gekichumai/dxdata";
import { ButtonBase, Chip } from "@mui/material";
import { FC, useMemo } from "react";
import { Control, useController } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLongPress } from "use-long-press";
import { SheetSortFilterForm } from "../SheetSortFilter";
import { SheetFilterSection } from "./SheetFilterSection";

const SheetVersionFilterInputVersion = ({
  version,
  selected,
  onToggle,
  onOnly,
}: {
  version: VersionEnum;
  selected: boolean;
  onToggle: () => void;
  onOnly: () => void;
}) => {
  const bind = useLongPress(onOnly, {
    threshold: 300,
    onCancel: onToggle,
    captureEvent: true,
  });

  return (
    <ButtonBase {...bind()} className="rounded-full overflow-hidden">
      <Chip
        label={version.replace(" PLUS", "+")}
        color={selected ? "primary" : "default"}
        size="small"
      />
    </ButtonBase>
  );
};

const SheetVersionFilterInput = ({
  value,
  onChange,
}: {
  value: VersionEnum[];
  onChange: (value: VersionEnum[]) => void;
}) => {
  const allEnums = useMemo(
    () =>
      VERSION_IDS.map((k) => ({
        id: k,
        selected: value.includes(k),
      })),
    [value],
  );

  return (
    <div className="flex flex-wrap gap-2">
      {allEnums.map((e) => (
        <SheetVersionFilterInputVersion
          key={e.id}
          version={e.id}
          selected={e.selected}
          onToggle={() => {
            const toggled = !e.selected;

            if (toggled) {
              onChange([...value, e.id]);
            } else {
              if (value.length === 1) {
                onChange([...VERSION_IDS]);
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

export const SheetVersionFilter: FC<{
  control: Control<SheetSortFilterForm>;
}> = ({ control }) => {
  const { t } = useTranslation(["sheet"]);
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, "filters.versions">({
    control,
    name: "filters.versions",
  });

  return (
    <SheetFilterSection title={t("sheet:filter.version.title")}>
      <SheetVersionFilterInput value={value} onChange={onChange} />
    </SheetFilterSection>
  );
};
