import {
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { FC, useContext, useMemo } from "react";
import { Control, Controller, useFieldArray } from "react-hook-form";
import { SheetSortFilterForm, SortPredicate } from "./SheetSortFilter";

import { AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import MdiAdd from "~icons/mdi/add";
import MdiClose from "~icons/mdi/close";
import { MotionButton } from "../../utils/motion";
import { SheetDetailsContext } from "../../models/context/SheetDetailsContext";

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
      initial: { scale: 0 },
      animate: { scale: 1 },
      exit: { scale: 0 },
    }),
    [],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {fields.map((field, index) => (
        <Controller
          name={`sorts.${index}`}
          key={field.id}
          render={({ field }) => (
            <FormControl>
              <InputLabel id={`sorts.${index}.label`}>
                {t(`sheet:sort.predicate`, { index: index + 1 })}
              </InputLabel>
              <Select
                label={t(`sheet:sort.predicate`, { index: index + 1 })}
                labelId={`sorts.${index}.label`}
                id={`sorts.${index}`}
                value={SortPredicateTransformer.from(field.value)}
                onChange={(e) => {
                  field.onChange(SortPredicateTransformer.to(e.target.value));
                }}
                disabled={queryActive}
                size="small"
                {...(index > 0 && {
                  endAdornment: (
                    <IconButton size="small" onClick={() => remove(index)}>
                      <MdiClose />
                    </IconButton>
                  ),
                })}
              >
                <MenuItem value="releaseDate_desc">
                  {t("sheet:sort.release-date.desc")}
                </MenuItem>
                <MenuItem value="releaseDate_asc">
                  {t("sheet:sort.release-date.asc")}
                </MenuItem>
                <MenuItem value="internalLevelValue_desc">
                  {t("sheet:sort.internal-level-value.desc")}
                </MenuItem>
                <MenuItem value="internalLevelValue_asc">
                  {t("sheet:sort.internal-level-value.asc")}
                </MenuItem>
              </Select>
            </FormControl>
          )}
        />
      ))}
      <AnimatePresence mode="popLayout">
        {fields.length <= 5 && (
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
