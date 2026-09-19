import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from '@mui/material'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

export type NetAutoImportMode = false | 'replace' | 'merge'

export function NetImportAutoImportOptions({
  value,
  disabled,
  onChange,
}: {
  value: NetAutoImportMode
  disabled: boolean
  onChange: (value: NetAutoImportMode) => void
}) {
  const { t } = useTranslation()
  const labelId = useId()

  return (
    <FormControl disabled={disabled} className="w-full">
      <FormLabel id={labelId}>
        <div className="flex flex-col gap-1">
          <span>{t('rating-calculator:io.import.net-records.dialog.auto-import.label')}</span>
          <span className="text-xs text-zinc-500">
            {t('rating-calculator:io.import.net-records.dialog.auto-import.description')}
          </span>
        </div>
      </FormLabel>
      <RadioGroup
        aria-labelledby={labelId}
        value={value || 'false'}
        onChange={(event) =>
          onChange(event.target.value === 'false' ? false : (event.target.value as NetAutoImportMode))
        }
      >
        {(['disabled', 'replace', 'merge'] as const).map((mode) => (
          <FormControlLabel
            key={mode}
            value={mode === 'disabled' ? 'false' : mode}
            control={<Radio size="small" />}
            className="min-h-11 !mr-0"
            label={
              <div className="flex flex-col py-1">
                <span className="text-sm">
                  {t(`rating-calculator:io.import.net-records.dialog.auto-import.options.${mode}.title`)}
                </span>
                {mode !== 'disabled' && (
                  <span className="text-xs opacity-60">
                    {t(`rating-calculator:io.import.net-records.dialog.auto-import.options.${mode}.description`)}
                  </span>
                )}
              </div>
            }
          />
        ))}
      </RadioGroup>
    </FormControl>
  )
}