import { TextField, TextFieldProps } from "@mui/material";
import { FC, useMemo } from "react";
import {
  Control,
  FieldPath,
  UseControllerProps,
  useController,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SheetSortFilterForm } from "../SheetSortFilter";
import { useControllerRulePresets } from "./useControllerRulePresets";

const SheetFilterInternalLevelValueInput = <T extends SheetSortFilterForm>({
  label,
  name,
  control,
  TextFieldProps,
  controllerProps,
}: {
  label: string;
  name: FieldPath<T>;
  control: Control<T>;
  TextFieldProps?: TextFieldProps;
  controllerProps?: Omit<UseControllerProps<T>, "control" | "name">;
}) => {
  const {
    field: { onChange, onBlur, value, ref },
    fieldState: { invalid, error },
  } = useController<T>({
    control,
    name,
    ...controllerProps,
  });

  return (
    <TextField
      label={label}
      variant="filled"
      type="number"
      error={invalid}
      helperText={error?.message}
      // react-hook-form registers
      {...{
        onChange,
        onBlur,
        value,
      }}
      inputRef={ref}
      // rest props
      {...TextFieldProps}
    />
  );
};

export const SheetInternalLevelFilter: FC<{
  control: Control<SheetSortFilterForm>;
}> = ({ control }) => {
  const { t } = useTranslation(["sheet"]);
  const rulePresets = useControllerRulePresets();
  const internalLevelValueBoundRules = useMemo(
    () => ({
      min: rulePresets.min(t("sheet:filter.internal-level-value.min"), 0),
      max: rulePresets.max(t("sheet:filter.internal-level-value.max"), 15),
    }),
    [rulePresets, t],
  );

  return (
    <div className="flex gap-2">
      <SheetFilterInternalLevelValueInput
        label={t("sheet:filter.internal-level-value.min")}
        name="internalLevelValue.gte"
        control={control}
        controllerProps={{
          rules: internalLevelValueBoundRules,
        }}
      />
      <SheetFilterInternalLevelValueInput
        label={t("sheet:filter.internal-level-value.max")}
        name="internalLevelValue.lte"
        control={control}
        controllerProps={{
          rules: internalLevelValueBoundRules,
        }}
      />
    </div>
  );
};
