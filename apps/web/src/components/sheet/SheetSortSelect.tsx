import {
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { FC } from "react";
import { Control, Controller, useFieldArray } from "react-hook-form";
import { SheetSortFilterForm, SortPredicate } from "./SheetSortFilter";

import { useTranslation } from "react-i18next";
import MdiAdd from "~icons/mdi/add";
import MdiClose from "~icons/mdi/close";

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
  const { t } = useTranslation(["sheet"]);
  const { fields, append, remove } = useFieldArray<SheetSortFilterForm>({
    control,
    name: "sorts",
  });

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
                size="small"
                {...(index > 0 && {
                  endAdornment: (
                    <IconButton onClick={() => remove(index)}>
                      <MdiClose />
                    </IconButton>
                  ),
                })}
              >
                <MenuItem value="internalLevelValue_asc">
                  {t("sheet:sort.internal-level-value.asc")}
                </MenuItem>
                <MenuItem value="internalLevelValue_desc">
                  {t("sheet:sort.internal-level-value.desc")}
                </MenuItem>
                <MenuItem value="releaseDate_asc">
                  {t("sheet:sort.release-date.asc")}
                </MenuItem>
                <MenuItem value="releaseDate_desc">
                  {t("sheet:sort.release-date.desc")}
                </MenuItem>
              </Select>
            </FormControl>
          )}
        />
      ))}
      <Button
        onClick={() =>
          append({ descriptor: "internalLevelValue", direction: "asc" })
        }
        startIcon={<MdiAdd />}
        variant="contained"
      >
        {t("sheet:sort.add")}
      </Button>
    </div>
  );
};
