import { ClickAwayListener, TextField, TextFieldProps } from "@mui/material";
import {
  FC,
  TouchEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Control,
  FieldPath,
  UseControllerProps,
  useController,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLockBodyScroll } from "react-use";
import MdiGestureSwipeVertical from "~icons/mdi/gesture-swipe-vertical";
import { SheetSortFilterForm } from "../SheetSortFilter";
import { useControllerRulePresets } from "./useControllerRulePresets";

function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

const SheetFilterInternalLevelValueInputLongPressSlider = ({
  value,
  onChange,
  min,
  max,
}: {
  value?: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPressed, setIsPressed] = useState(false);
  const inclusiveWholeNumbers = Array.from({ length: max - min + 1 }).map(
    (_, i) => min + i,
  );
  useLockBodyScroll(isPressed);

  useEffect(() => {
    document.body.style.userSelect = isPressed ? "none" : "";
    document.body.style.overflow = isPressed ? "hidden" : "";
    return () => {
      document.body.style.userSelect = "";
      document.body.style.overflow = "";
    };
  }, [isPressed]);

  const valuePercentage = ((value ?? 0) - min) / (max - min);

  const onPointerMove: TouchEventHandler<HTMLDivElement> = (e) => {
    console.log("onPointerMove");
    if (!isPressed) return;
    if (!containerRef.current) return;
    if (e.touches.length !== 1) return;
    const { top, height } = containerRef.current.getBoundingClientRect();
    const padding = 8 + 10; // each side; padding + half size of text mark
    const offset = e.touches[0].clientY - top;
    const mappedOffset = mapRange(
      offset,
      0,
      height,
      -padding,
      height - padding,
    );
    const percentageFromTop = mappedOffset / (height - padding * 2);
    const unroundedValue = (max - min) * percentageFromTop + min;
    const unclampedValue = Math.round(unroundedValue * 10) / 10;
    const value = Math.max(min, Math.min(max, unclampedValue));
    onChange(value);
  };

  const indicatorPosition = useMemo(() => {
    if (!containerRef.current) return 0;
    const { height } = containerRef.current.getBoundingClientRect();
    const padding = 8; // each side
    const indicatorHeight = 32;
    return mapRange(
      valuePercentage * height,
      0,
      height,
      padding,
      height - padding - indicatorHeight,
    );
  }, [containerRef, valuePercentage]);

  return (
    <ClickAwayListener onClickAway={() => setIsPressed(false)}>
      <div className="relative select-none">
        <div
          className="cursor-row-resize bg-white/50 rounded-full shadow px-2 py-4 touch-none"
          onTouchStart={() => {
            setIsPressed(true);
          }}
          onTouchMove={onPointerMove}
          onTouchEnd={() => setIsPressed(false)}
        >
          <MdiGestureSwipeVertical fontSize="1rem" />
        </div>
        {isPressed && (
          <div
            className="absolute top-0 -left-0.5 w-10 h-[50svh] -translate-y-1/2 flex flex-col items-center justify-between bg-gray-200 px-2 py-2 shadow rounded-full z-10"
            ref={containerRef}
            onTouchMove={onPointerMove}
            onTouchEnd={() => setIsPressed(false)}
          >
            {inclusiveWholeNumbers.map((i) => (
              <div key={i} className="text-sm text-black/50 font-mono">
                {i}
              </div>
            ))}
            {value !== undefined && value >= min && value <= max && (
              <div
                className="h-8 w-8 rounded-full bg-gray-500 text-white flex items-center justify-center absolute left-0 text-xs left-1"
                style={{
                  top: `${indicatorPosition}px`,
                }}
              >
                {value}
              </div>
            )}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
};

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
    <div className="flex items-start gap-2">
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

      <SheetFilterInternalLevelValueInputLongPressSlider
        value={value}
        onChange={onChange}
        min={9}
        max={15}
      />
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
    <div className="flex flex-col gap-2">
      <SheetFilterInternalLevelValueInput
        label={t("sheet:filter.internal-level-value.min")}
        name="internalLevelValue.gte"
        control={control}
        controllerProps={{
          rules: internalLevelValueBoundRules,
        }}
        TextFieldProps={{
          className: "w-80",
        }}
      />
      <SheetFilterInternalLevelValueInput
        label={t("sheet:filter.internal-level-value.max")}
        name="internalLevelValue.lte"
        control={control}
        controllerProps={{
          rules: internalLevelValueBoundRules,
        }}
        TextFieldProps={{
          className: "w-80",
        }}
      />
    </div>
  );
};
