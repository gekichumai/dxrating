import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from '@mui/material'
import { useId } from 'react'
import { toggleFocusRing } from '../../focusRing'
import type { PlainMessage } from '@/i18n/message'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export type NetAutoImportMode = false | 'replace' | 'merge'

const OPTION_TITLES = {
  disabled: m.ratingCalculator_io_import_netRecords_dialog_autoImport_options_disabled_title,
  replace: m.ratingCalculator_io_import_netRecords_dialog_autoImport_options_replace_title,
  merge: m.ratingCalculator_io_import_netRecords_dialog_autoImport_options_merge_title,
} satisfies Record<'disabled' | 'replace' | 'merge', PlainMessage>

const OPTION_DESCRIPTIONS = {
  replace: m.ratingCalculator_io_import_netRecords_dialog_autoImport_options_replace_description,
  merge: m.ratingCalculator_io_import_netRecords_dialog_autoImport_options_merge_description,
} satisfies Record<'replace' | 'merge', PlainMessage>

export function NetImportAutoImportOptions({
  value,
  disabled,
  onChange,
}: {
  value: NetAutoImportMode
  disabled: boolean
  onChange: (value: NetAutoImportMode) => void
}) {
  const locale = useLocale()
  const labelId = useId()

  return (
    <FormControl disabled={disabled} className="w-full">
      <FormLabel id={labelId}>
        <div className="flex flex-col gap-1">
          <span>{m.ratingCalculator_io_import_netRecords_dialog_autoImport_label({}, { locale })}</span>
          <span className="text-xs text-secondary">
            {m.ratingCalculator_io_import_netRecords_dialog_autoImport_description({}, { locale })}
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
            control={<Radio size="small" sx={toggleFocusRing} />}
            className="min-h-11 !mr-0"
            label={
              <div className="flex flex-col py-1">
                <span className="text-sm">{OPTION_TITLES[mode]({}, { locale })}</span>
                {mode !== 'disabled' && (
                  <span className="text-xs text-secondary">{OPTION_DESCRIPTIONS[mode]({}, { locale })}</span>
                )}
              </div>
            }
          />
        ))}
      </RadioGroup>
    </FormControl>
  )
}