import { DevTool } from "@hookform/devtools";
import { Paper } from "@mui/material";
import { FC, useEffect } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { SheetInternalLevelFilter } from "./filters/SheetInternalLevelFilter";

export interface SheetSortFilterForm {
  filters: {
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
    <Paper className="flex w-full p-4">
      {import.meta.env.DEV && <DevTool control={control} />}
      <SheetInternalLevelFilter control={control} />
    </Paper>
  );
};
