import { VERSION_ID_MAP, VersionEnum } from "@gekichumai/dxdata";
import { Chip } from "@mui/material";
import { FC, useEffect, useMemo } from "react";
import { Control, useController } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLongPress, useSet } from "react-use";
import { SheetSortFilterForm } from "../SheetSortFilter";
import { SheetFilterSection } from "./SheetFilterSection";

const SheetVersionFilterInputVersion = ({
  version,
  selected,
  onChange,
  onOnly,
}: {
  version: VersionEnum;
  selected: boolean;
  onChange: (selected: boolean) => void;
  onOnly: () => void;
}) => {
  const bind = useLongPress(
    () => {
      onOnly();
    },
    { isPreventDefault: true, delay: 500 },
  );

  return (
    <Chip
      label={version}
      onClick={() => {
        onChange(!selected);
      }}
      color={selected ? "primary" : "default"}
      {...bind}
    />
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
      (Array.from(VERSION_ID_MAP.keys()) as VersionEnum[]).map((k) => ({
        id: k,
        selected: has(k),
      })),
    [has],
  );

  return (
    <div className="flex flex-wrap gap-2">
      {allEnums.map((e) => (
        // <Chip
        //   key={e.id}
        //   label={e.id}
        //   onClick={() => {
        //     if (e.selected) {
        //       remove(e.id as VersionEnum);
        //     } else {
        //       add(e.id as VersionEnum);
        //     }
        //   }}
        //   color={e.selected ? "primary" : "default"}
        // />
        <SheetVersionFilterInputVersion
          key={e.id}
          version={e.id}
          selected={e.selected}
          onChange={(selected) => {
            if (selected) {
              add(e.id as VersionEnum);
            } else {
              if (Array.from(set.keys()).length === 1) {
                reset();
              } else {
                remove(e.id as VersionEnum);
              }
            }
          }}
          onOnly={() => {
            (Array.from(VERSION_ID_MAP.keys()) as VersionEnum[]).forEach(
              (k) => {
                if (k === e.id) {
                  add(k);
                } else {
                  remove(k);
                }
              },
            );
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
  } = useController<SheetSortFilterForm>({
    control,
    name: "filters.versions",
  });

  return (
    <SheetFilterSection title={t("sheet:filter.version.title")}>
      <SheetVersionFilterInput value={value} onChange={onChange} />
    </SheetFilterSection>
  );
};
