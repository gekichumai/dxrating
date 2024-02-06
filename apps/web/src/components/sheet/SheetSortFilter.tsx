import { VersionEnum } from "@gekichumai/dxdata";
import { DevTool } from "@hookform/devtools";
import { Paper } from "@mui/material";
import { FC, useEffect } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { SheetInternalLevelFilter } from "./filters/SheetInternalLevelFilter";
import { SheetVersionFilter } from "./filters/SheetVersionFilter";

export interface SheetSortFilterForm {
  filters: {
    versions: VersionEnum[];
    internalLevelValue?: {
      min: number;
      max: number;
    };
  };
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
        onChange?.(data);
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
        <div className="text-xl font-bold tracking-tight">Filters</div>
        <div className="grid grid-cols-2 gap-2">
          <SheetVersionFilter control={control} />
          <SheetInternalLevelFilter control={control} />
        </div>
      </Paper>
    </>
  );
};
