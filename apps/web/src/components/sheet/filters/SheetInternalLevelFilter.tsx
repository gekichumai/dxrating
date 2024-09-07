import { TextFieldProps } from "@mui/material";
import { FC, useMemo } from "react";
import {
  Control,
  FieldPath,
  useController,
  UseControllerProps,
} from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useControllerRulePresets } from "../../global/form/useControllerRulePresets";
import { TouchDeviceGuard } from "../../global/TouchDeviceGuard";
import { SheetSortFilterForm } from "../SheetSortFilter";

import { FloatValueInputField } from "./FloatValueInputField";
import { SheetFilterInternalLevelInputLongPressSlider } from "./SheetFilterLevelInputLongPressSlider";
import { SheetFilterSection } from "./SheetFilterSection";

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
    <div className="flex items-center gap-2 w-full md:w-auto">
      <FloatValueInputField
        onChange={(v) => onChange(v)}
        value={value as number}
        // rest props
        ref={ref}
        onBlur={onBlur}
        TextFieldProps={{
          variant: "filled",
          label,
          error: invalid,
          helperText: error?.message,
          ...TextFieldProps,
        }}
      />

      <TouchDeviceGuard renderOnlyOn="touch">
        <div className="block md:hidden h-px w-full flex-1 bg-gray-3 mx-2 select-none" />
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
