import { TextField, type TextFieldProps } from '@mui/material'
import { type ForwardedRef, forwardRef, useEffect, useState } from 'react'

const fixedDecimalPrecision = (value: number, precision: number) => Number.parseFloat(value.toFixed(precision))

export const FloatValueInputField = forwardRef(
  (
    {
      onChange,
      onBlur,
      value,
      TextFieldProps,
    }: {
      onChange: (value: number) => void
      onBlur?: TextFieldProps['onBlur']
      value: number
      TextFieldProps?: Omit<
        TextFieldProps,
        'value' | 'onChange' | 'type' | 'inputProps' | 'inputRef' | 'onWheel' | 'onBlur'
      >
    },
    ref: ForwardedRef<HTMLInputElement>,
  ) => {
    const [internalInputValue, setInternalInputValue] = useState(value.toFixed(1).toString())
    useEffect(() => {
      setInternalInputValue(value.toFixed(1).toString())
    }, [value])

    return (
      <TextField
        type="number"
        inputProps={{
          min: 1,
          step: 0.1,
        }}
        value={internalInputValue}
        onChange={(e) => {
          setInternalInputValue(e.target.value)
        }}
        onBlur={(e) => {
          const newValue = Number.parseFloat(internalInputValue)
          if (!Number.isNaN(newValue)) {
            const adjustedValue = fixedDecimalPrecision(newValue, 1)
            onChange(adjustedValue)
            setInternalInputValue(adjustedValue.toFixed(1).toString())
          } else {
            // Reset the input value to the current value
            setInternalInputValue(value.toFixed(1).toString())
          }

          // Trigger the onBlur event
          onBlur?.(e)

          // Actually blur the input
          setTimeout(() => {
            const target = e.target as HTMLElement
            target.blur()
          }, 0)
        }}
        onWheel={(e) => {
          const target = e.target as HTMLElement
          // Prevent the input value change
          target.blur()

          // Prevent the page/container scrolling
          e.stopPropagation()
        }}
        inputRef={ref}
        // rest props
        {...TextFieldProps}
      />
    )
  },
)
