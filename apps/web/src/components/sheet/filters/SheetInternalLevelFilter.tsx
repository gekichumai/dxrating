import { TextField, TextFieldProps } from "@mui/material";
import { FC, useMemo } from "react";
import {
  Control,
  FieldPath,
  UseControllerProps,
  useController,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { TouchDeviceGuard } from "../../global/TouchDeviceGuard";
import { SheetSortFilterForm } from "../SheetSortFilter";
import { SheetFilterInternalLevelInputLongPressSlider } from "./SheetFilterLevelInputLongPressSlider";
import { SheetFilterSection } from "./SheetFilterSection";
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

  const formattedValue = useMemo(() => {
    if (typeof value === "number") {
      return value.toFixed(1);
    }
    return undefined;
  }, [value]);

  return (
    <div className="flex items-center gap-2 w-full md:w-auto">
      <TextField
        label={label}
        variant="filled"
        type="number"
        error={invalid}
        helperText={error?.message}
        // react-hook-form registers
        {...{
          onChange: (e) => {
            onChange(parseFloat(e.target.value));
          },
          onBlur,
          value: formattedValue,
        }}
        inputProps={{
          min: 0,
          step: 0.1,
        }}
        inputRef={ref}
        onWheel={(e) => {
          const target = e.target as HTMLElement;
          // Prevent the input value change
          target.blur();

          // Prevent the page/container scrolling
          e.stopPropagation();
        }}
        // rest props
        {...TextFieldProps}
      />

      <TouchDeviceGuard renderOnlyOn="touch">
        <div className="block md:hidden h-px w-full flex-1 bg-gray-300 mx-2 select-none" />
      </TouchDeviceGuard>

      <TouchDeviceGuard renderOnlyOn="touch">
        <SheetFilterInternalLevelInputLongPressSlider
          value={value as number}
          onChange={onChange}
          min={9}
          max={15}
        />
      </TouchDeviceGuard>
    </div>
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
    <SheetFilterSection title={t("sheet:filter.internal-level-value.title")}>
      <SheetFilterInternalLevelValueInput
        label={t("sheet:filter.internal-level-value.min")}
        name="filters.internalLevelValue.min"
        control={control}
        controllerProps={{
          rules: internalLevelValueBoundRules,
        }}
        TextFieldProps={{
          className: "md:max-w-36",
        }}
      />
      <SheetFilterInternalLevelValueInput
        label={t("sheet:filter.internal-level-value.max")}
        name="filters.internalLevelValue.max"
        control={control}
        controllerProps={{
          rules: internalLevelValueBoundRules,
        }}
        TextFieldProps={{
          className: "md:max-w-36",
        }}
      />
    </SheetFilterSection>
  );
};
