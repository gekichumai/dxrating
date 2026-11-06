import { FormControlLabel, Slider, Switch } from '@mui/material'
import clsx from 'clsx'
import { type FC, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiMinus from '~icons/mdi/minus'
import IconMdiPlus from '~icons/mdi/plus'
import {
  chipCoverage,
  formatTenths,
  isSameRange,
  LEVEL_CHIPS,
  type LevelChip,
  type LevelRange,
  levelChipRange,
  normalizeRange,
  RANGE_CEILING,
  RANGE_FLOOR,
  RANGE_FLOOR_EXTENDED,
  spanChips,
  stepRange,
} from './levelRange'

const chipClassName = (state: 'inside' | 'partial' | 'none' | 'push-on' | 'push-off') =>
  clsx(
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-solid px-2.5 py-1 text-sm font-semibold num',
    'cursor-pointer transition-colors duration-[var(--duration-fast)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]',
    state === 'inside' || state === 'push-on'
      ? 'border-accent-strong bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] text-fg-1'
      : state === 'partial'
        ? 'border-dashed border-accent-strong bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] text-fg-1'
        : 'glass-inset border-[var(--glass-border)] text-fg-1 hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]',
  )

const StepButton: FC<{ label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }> = ({
  label,
  disabled,
  onClick,
  children,
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={clsx(
      'inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-none bg-transparent text-fg-1',
      'cursor-pointer transition-colors duration-[var(--duration-fast)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]',
      'hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] disabled:cursor-default disabled:opacity-40',
    )}
  >
    {children}
  </button>
)

export const LevelRangePicker: FC<{
  range: LevelRange
  onChange: (range: LevelRange) => void
  showBelow9: boolean
  onShowBelow9Change: (show: boolean) => void
  /** Where an SSS+ raises the user's rating; null with no scores */
  pushRange: LevelRange | null
}> = ({ range, onChange, showBelow9, onShowBelow9Change, pushRange }) => {
  const { t } = useTranslation(['random'])
  const sliderLabelId = useId()
  const floor = showBelow9 ? RANGE_FLOOR_EXTENDED : RANGE_FLOOR
  // The first chip of a two-tap span; any other change of the range drops it
  const [anchor, setAnchor] = useState<LevelChip | null>(null)

  const set = (next: LevelRange) => {
    setAnchor(null)
    onChange(normalizeRange(next, floor))
  }

  /** A preset (the push range) keeps its real bounds: one below 9 opens the extended scale instead of being clamped */
  const applyPreset = (preset: LevelRange) => {
    if (preset.min < RANGE_FLOOR && !showBelow9) onShowBelow9Change(true)
    setAnchor(null)
    onChange(normalizeRange(preset, RANGE_FLOOR_EXTENDED))
  }

  const onChip = (chip: LevelChip) => {
    if (anchor && anchor !== chip) {
      setAnchor(null)
      onChange(spanChips(anchor, chip))
      return
    }
    setAnchor(anchor === chip ? null : chip)
    onChange(levelChipRange(chip))
  }

  const marks = Array.from({ length: (RANGE_CEILING - floor) / 10 + 1 }, (_, index) => {
    const value = floor / 10 + index
    // With the extended scale, label only every few levels so they do not collide on a phone
    const labelled = !showBelow9 || value === 1 || value % 5 === 0 || value >= 13
    return { value, label: labelled ? String(value) : undefined }
  })

  const endControl = (end: 'min' | 'max') => {
    const value = range[end]
    const atLow = end === 'min' ? value <= floor : value <= range.min
    const atHigh = end === 'min' ? value >= range.max : value >= RANGE_CEILING
    return (
      <fieldset
        className="glass-inset m-0 flex min-w-0 items-center justify-between gap-0.5 rounded-[var(--radius-md)] border border-solid border-[var(--glass-border)] p-0.5"
        aria-label={t(`random:range.${end}`)}
      >
        <StepButton
          label={t(`random:range.${end}-down`)}
          disabled={atLow}
          onClick={() => set(stepRange(range, end, -1, floor))}
        >
          <IconMdiMinus aria-hidden className="size-5" />
        </StepButton>
        <span className="min-w-[3.25ch] text-center text-[1.75rem] font-semibold leading-none tracking-[-0.01em] display-num sm:text-3xl">
          {formatTenths(value)}
        </span>
        <StepButton
          label={t(`random:range.${end}-up`)}
          disabled={atHigh}
          onClick={() => set(stepRange(range, end, 1, floor))}
        >
          <IconMdiPlus aria-hidden className="size-5" />
        </StepButton>
      </fieldset>
    )
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-none p-0">
      <legend className="mb-2 p-0 text-sm font-semibold">{t('random:range.title')}</legend>

      {pushRange && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            aria-pressed={isSameRange(range, pushRange)}
            onClick={() => applyPreset(pushRange)}
            className={chipClassName(isSameRange(range, pushRange) ? 'push-on' : 'push-off')}
          >
            {t('random:range.push')}
            <span className="font-normal text-fg-2">
              {formatTenths(pushRange.min)}–{formatTenths(pushRange.max)}
            </span>
          </button>
          <span className="text-xs text-fg-2">{t('random:range.push-hint')}</span>
        </div>
      )}

      <fieldset
        className="m-0 grid min-w-0 grid-cols-5 gap-1.5 border-none p-0 sm:grid-cols-9"
        aria-label={t('random:range.chips')}
      >
        {LEVEL_CHIPS.map((chip) => {
          const coverage = chipCoverage(chip, range)
          const chipRange = levelChipRange(chip)
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={coverage === 'inside'}
              aria-label={t('random:range.chip-aria', {
                level: chip,
                min: formatTenths(chipRange.min),
                max: formatTenths(chipRange.max),
              })}
              onClick={() => onChip(chip)}
              className={clsx(
                chipClassName(coverage),
                anchor === chip && 'outline outline-2 outline-offset-2 outline-accent',
              )}
            >
              {chip}
            </button>
          )
        })}
      </fieldset>
      {/* Mounted throughout so the hint is announced; it takes no room until the first chip of a span is tapped */}
      <p className={anchor ? '-mt-1 m-0 text-xs leading-4 text-fg-2' : 'sr-only'} aria-live="polite">
        {anchor ? t('random:range.span-hint') : ''}
      </p>

      {/* The range in large type, each end with its own steppers: the main control on a phone */}
      {/* Side by side from 400px; below that the two ends do not fit with 44px steppers, so each gets its own row */}
      <div className="grid grid-cols-1 items-center gap-2 min-[400px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[400px]:gap-1">
        {endControl('min')}
        <span aria-hidden className="hidden px-0.5 text-xl text-fg-2 min-[400px]:inline">
          –
        </span>
        {endControl('max')}
      </div>

      <div className="flex flex-col gap-1">
        <span id={sliderLabelId} className="sr-only">
          {t('random:range.slider')}
        </span>
        <Slider
          className="mx-3 w-auto"
          aria-labelledby={sliderLabelId}
          value={[range.min / 10, range.max / 10]}
          min={floor / 10}
          max={RANGE_CEILING / 10}
          step={0.1}
          marks={marks}
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => value.toFixed(1)}
          getAriaValueText={(value) => value.toFixed(1)}
          disableSwap
          onChange={(_, value) => {
            const [min, max] = value as number[]
            set({ min: Math.round(min! * 10), max: Math.round(max! * 10) })
          }}
        />
        <FormControlLabel
          className="self-end !mr-0"
          control={
            <Switch
              size="small"
              checked={showBelow9}
              onChange={(event) => {
                const show = event.target.checked
                onShowBelow9Change(show)
                if (!show && range.min < RANGE_FLOOR) set(normalizeRange(range, RANGE_FLOOR))
              }}
            />
          }
          label={<span className="text-xs text-fg-2">{t('random:range.below-9')}</span>}
        />
      </div>
    </fieldset>
  )
}