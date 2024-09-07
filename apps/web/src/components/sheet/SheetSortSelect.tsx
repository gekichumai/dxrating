import { CloseButton, Select } from "@mantine/core";
import { AnimatePresence } from "framer-motion";
import { FC, useContext, useMemo } from "react";
import { Control, Controller, useFieldArray } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { SheetDetailsContext } from "../../models/context/SheetDetailsContext";
import { MotionButton } from "../../utils/motion";

import { SheetSortFilterForm, SortPredicate } from "./SheetSortFilter";

import MdiAdd from "~icons/mdi/add";

const SortPredicateTransformer = {
  to: (value: string) => {
    const [descriptor, direction] = value.split("_");
    return {
      descriptor,
      direction,
    } as SortPredicate;
  },
  from: (value: SortPredicate) => {
    return `${value.descriptor}_${value.direction}`;
  },
};

export const SheetSortSelect: FC<{
  control: Control<SheetSortFilterForm>;
}> = ({ control }) => {
  const { queryActive } = useContext(SheetDetailsContext);
  const { t } = useTranslation(["sheet"]);
  const { fields, append, remove } = useFieldArray<SheetSortFilterForm>({
    control,
    name: "sorts",
  });

  const addSortButtonVariants = useMemo(
    () => ({
      initial: { opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      exit: { scale: 0, opacity: 0 },
    }),
    [],
  );

  return (
    <div className="flex flex-wrap items-end gap-1">
      {fields.map((field, index) => (
        <Controller
          name={`sorts.${index}`}
          key={field.id}
          render={({ field }) => (
            <Select
              label={t(`sheet:sort.predicate`, { index: index + 1 })}
              value={SortPredicateTransformer.from(field.value)}
              onChange={(e) => {
                if (e === null) return;
                field.onChange(SortPredicateTransformer.to(e));
              }}
              disabled={queryActive}
              {...(index > 0 && {
                rightSection: (
                  <CloseButton size="sm" onClick={() => remove(index)} />
                ),
                rightSectionPointerEvents: "auto",
              })}
              comboboxProps={{
                width: 240,
              }}
              checkIconPosition="right"
              data={[
                {
                  label: t("sheet:sort.release-date.desc"),
                  value: "releaseDate_desc",
                },
                {
                  label: t("sheet:sort.release-date.asc"),
                  value: "releaseDate_asc",
                },
                {
                  label: t("sheet:sort.internal-level-value.desc"),
                  value: "internalLevelValue_desc",
                },
                {
                  label: t("sheet:sort.internal-level-value.asc"),
                  value: "internalLevelValue_asc",
                },
              ]}
            />
          )}
        />
      ))}
      <AnimatePresence mode="popLayout">
        {fields.length <= 3 && (
          <MotionButton
            layout
            onClick={() =>
              append({ descriptor: "internalLevelValue", direction: "desc" })
            }
            startIcon={<MdiAdd />}
            variant="contained"
            variants={addSortButtonVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            disabled={queryActive}
          >
            {t("sheet:sort.add")}
          </MotionButton>
        )}
      </AnimatePresence>
    </div>
  );
};
