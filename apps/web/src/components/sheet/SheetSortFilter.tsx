import { FC } from "react";
import { useForm } from "react-hook-form";
import { SheetInternalLevelFilter } from "./filters/SheetInternalLevelFilter";

export interface SheetSortFilterForm {
  internalLevelValue?: {
    gte: number;
    lte: number;
  };
}

export const SheetSortFilter: FC = () => {
  const { control } = useForm<SheetSortFilterForm>({
    defaultValues: {
      internalLevelValue: {
        gte: 0,
        lte: 15.0,
      },
    },
  });

  return (
    <div className="flex gap-2">
      {/* {import.meta.env.DEV && <DevTool control={control} />} */}
      <SheetInternalLevelFilter control={control} />
    </div>
  );
};
