import type { TextFieldProps } from '@mui/material'
import { type FC, useMemo } from 'react'
import { type Control, type FieldPath, useController, type UseControllerProps } from 'react-hook-form'
import { useControllerRulePresets } from '../../global/form/useControllerRulePresets'
import { TouchDeviceGuard } from '../../global/TouchDeviceGuard'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { FloatValueInputField } from './FloatValueInputField'
import { SheetFilterInternalLevelInputLongPressSlider } from './SheetFilterLevelInputLongPressSlider'
import { SheetFilterSection } from './SheetFilterSection'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const SheetFilterInternalLevelValueInput = <T extends SheetSortFilterForm>({
  label,
  name,
  control,
  TextFieldProps,
  controllerProps,
}: {
  label: string
  name: FieldPath<T>
  control: Control<T>
  TextFieldProps?: TextFieldProps
  controllerProps?: Omit<UseControllerProps<T>, 'control' | 'name'>
}) => {
  const {
    field: { onChange, onBlur, value, ref },
    fieldState: { invalid, error },
  } = useController<T>({
    control,
    name,
    ...controllerProps,
  })

  return (
    <div className="flex items-center gap-2 w-full md:w-auto">
      <FloatValueInputField
        onChange={(v) => onChange(v)}
        value={value as number}
        // rest props
        ref={ref}
        onBlur={onBlur}
        TextFieldProps={{
          variant: 'outlined',
          size: 'small',
          label,
          error: invalid,
          helperText: error?.message,
          ...TextFieldProps,
        }}
      />

      <TouchDeviceGuard renderOnlyOn="touch">
        <div aria-hidden="true" className="block md:hidden h-px w-full flex-1 bg-black/12 mx-2" />
      </TouchDeviceGuard>

      <TouchDeviceGuard renderOnlyOn="touch">
        <SheetFilterInternalLevelInputLongPressSlider value={value as number} onChange={onChange} min={9} max={15} />
      </TouchDeviceGuard>
    </div>
  )
}

export const SheetInternalLevelFilter: FC<{
  control: Control<SheetSortFilterForm>
  reset: () => void
}> = ({ control, reset }) => {
  const locale = useLocale()
  const rulePresets = useControllerRulePresets()
  const internalLevelValueBoundRules = useMemo(
    () => ({
      min: rulePresets.min(m.sheet_filter_internalLevelValue_min({}, { locale }), 0),
      max: rulePresets.max(m.sheet_filter_internalLevelValue_max({}, { locale }), 15),
    }),
    [rulePresets, locale],
  )

  return (
    <SheetFilterSection titleLeft={m.sheet_filter_internalLevelValue_title({}, { locale })} reset={reset}>
      <SheetFilterInternalLevelValueInput
        label={m.sheet_filter_internalLevelValue_min({}, { locale })}
        name="filters.internalLevelValue.min"
        control={control}
        controllerProps={{
          rules: internalLevelValueBoundRules,
        }}
        TextFieldProps={{
          className: 'md:max-w-36',
        }}
      />
      <SheetFilterInternalLevelValueInput
        label={m.sheet_filter_internalLevelValue_max({}, { locale })}
        name="filters.internalLevelValue.max"
        control={control}
        controllerProps={{
          rules: internalLevelValueBoundRules,
        }}
        TextFieldProps={{
          className: 'md:max-w-36',
        }}
      />
    </SheetFilterSection>
  )
}