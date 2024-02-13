import { VersionEnum } from "@gekichumai/dxdata";
import { DevTool } from "@hookform/devtools";
import { Paper } from "@mui/material";
import { FC, useEffect } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { FlattenedSheet } from "../../songs";
import { SheetSortSelect } from "./SheetSortSelect";
import { SheetInternalLevelFilter } from "./filters/SheetInternalLevelFilter";
import { SheetVersionFilter } from "./filters/SheetVersionFilter";

export interface SortPredicate {
  descriptor: keyof FlattenedSheet;
  direction: "asc" | "desc";
}

export interface SheetSortFilterForm {
  filters: {
    versions: VersionEnum[];
    internalLevelValue?: {
      min: number;
      max: number;
    };
  };
  sorts: SortPredicate[];
}

export const SheetSortFilter: FC<{
  onChange?: (form: SheetSortFilterForm) => void;
}> = ({ onChange }) => {
  const methods = useForm<SheetSortFilterForm>({
    mode: "onChange",
    defaultValues: {
      filters: {
        versions: Object.values(VersionEnum),
        internalLevelValue: {
          min: 1.0,
          max: 15.0,
        },
      },
      sorts: [
        {
          descriptor: "releaseDate",
          direction: "desc",
        },
      ],
    },
  });

  return (
    <FormProvider {...methods}>
      <SheetSortFilterFormListener onChange={onChange} />
      <SheetSortFilterForm />
    </FormProvider>
  );
};

const SheetSortFilterFormListener: FC<{
  onChange?: (form: SheetSortFilterForm) => void;
}> = ({ onChange }) => {
  const { watch } = useFormContext<SheetSortFilterForm>();

  useEffect(() => {
    watch((data) => {
      if (data.filters) {
        // @eslint-disable-next-line
        onChange?.(data as any);
      }
    });
  }, [onChange, watch]);

  return null;
};

const SheetSortFilterForm = () => {
  const { control } = useFormContext<SheetSortFilterForm>();

  return (
    <>
      {import.meta.env.DEV && <DevTool control={control} />}
      <Paper className="p-4 w-full flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <div className="text-xl font-bold tracking-tight">Filters</div>
          <div className="grid grid-cols-2 gap-2">
            <SheetVersionFilter control={control} />
            <SheetInternalLevelFilter control={control} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="text-xl font-bold tracking-tight">Sort</div>
          <SheetSortSelect control={control} />
        </div>
      </Paper>
    </>
  );
};
