import { VERSION_IDS, VersionEnum } from "@gekichumai/dxdata";
import { ButtonBase, Chip } from "@mui/material";
import { FC, useEffect, useMemo } from "react";
import { Control, useController } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useSet } from "react-use";
import { useLongPress } from "../../../utils/useLongPress";
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
  const bindings = useLongPress({
    delay: 300,
    onLongPress: onOnly,
    onClick: onToggle,
  });

  return (
    <ButtonBase {...bindings} className="rounded-full overflow-hidden">
      <Chip
        label={version}
        color={selected ? "primary" : "default"}
        className="border-solid border-gray-800"
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
  const [set, { add, remove, has, reset }] = useSet<VersionEnum>(
    new Set(value),
  );
  useEffect(() => {
    onChange(Array.from(set));
  }, [set, onChange]);

  const allEnums = useMemo(
    () =>
      VERSION_IDS.map((k) => ({
        id: k,
        selected: has(k),
      })),
    [has],
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
              add(e.id);
            } else {
              if (set.size === 1) {
                reset();
              } else {
                remove(e.id);
              }
            }
          }}
          onOnly={() => {
            VERSION_IDS.forEach((k) => {
              if (k === e.id) {
                add(k);
              } else {
                remove(k);
              }
            });
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
