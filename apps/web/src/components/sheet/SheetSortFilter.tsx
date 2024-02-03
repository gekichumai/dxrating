import { DevTool } from "@hookform/devtools";
import { FC, useEffect } from "react";
import { FormProvider, useForm, useFormContext } from "react-hook-form";
import { SheetInternalLevelFilter } from "./filters/SheetInternalLevelFilter";

export interface SheetSortFilterForm {
  internalLevelValue?: {
    gte: number;
    lte: number;
  };
}

export const SheetSortFilter: FC<{
  onChange?: (form: SheetSortFilterForm) => void;
}> = ({ onChange }) => {
  const methods = useForm<SheetSortFilterForm>({
    mode: "onChange",
    defaultValues: {
      internalLevelValue: {
        gte: 0.0,
        lte: 15.0,
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
      onChange?.(data);
    });
  }, [onChange, watch]);

  return null;
};

const SheetSortFilterForm = () => {
  const { control } = useFormContext<SheetSortFilterForm>();

  return (
    <div className="flex gap-2">
      {import.meta.env.DEV && <DevTool control={control} />}
      <SheetInternalLevelFilter control={control} />
    </div>
  );
};
