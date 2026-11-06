import type { NoteCounts } from '@gekichumai/dxdata'
import {
  type ToleranceCombination,
  type ToleranceJudgement,
  type ToleranceNoteType,
  combinationUsed,
  evaluateCombination,
  toToleranceNoteCounts,
} from '@gekichumai/maimai-domain'
import { Chip, FormHelperText, InputAdornment, TextField } from '@mui/material'
import { type FC, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import MdiMinus from '~icons/mdi/minus'
import MdiPlus from '~icons/mdi/plus'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { captureAnalyticsEvent } from '@/lib/analytics'
import {
  MAX_ACHIEVEMENT,
  TOLERANCE_TARGET_PRESETS,
  type ToleranceCell,
  type ToleranceRow,
  parseNumberInput,
  toleranceRows,
} from './ratingTools'

export type ToleranceSheet = {
  songId: string
  type: string
  difficulty: string
  noteCounts?: NoteCounts
}

const formatCount = (value: number) => value.toLocaleString('en-US')
const formatPercent = (value: number) => value.toFixed(4)
/** TAP GREAT exchange rate: whole numbers stay whole (×1, ×5), the rest keep two significant decimals */
const formatRate = (rate: number) => String(Number(rate.toFixed(rate >= 10 ? 1 : 2)))

export const ToleranceCalculator: FC<{
  sheet: ToleranceSheet
  source: 'chart_page' | 'tool_page'
  /** Heading level: a section on the chart page, the main content on the tool page */
  headingAs?: 'h2' | 'h3'
}> = ({ sheet, source, headingAs: Heading = 'h2' }) => {
  const { t } = useTranslation(['tools'])
  const [input, setInput] = useState('100.5')
  const [combination, setCombination] = useState<ToleranceCombination>({})
  const counts = useMemo(() => toToleranceNoteCounts(sheet.noteCounts), [sheet.noteCounts])
  const target = parseNumberInput(input)
  const valid = target !== null && target > 0 && target <= MAX_ACHIEVEMENT
  const rows = useMemo(() => (counts && valid ? toleranceRows(counts, target) : []), [counts, valid, target])
  const result = useMemo(
    () => (counts && valid ? evaluateCombination(counts, target, combination) : null),
    [counts, valid, target, combination],
  )
  const budgetTapGreats = useMemo(
    () => (counts && valid ? evaluateCombination(counts, target, {}).remainingTapGreats : 0),
    [counts, valid, target],
  )
  const empty = Object.values(combination).every((judgements) => Object.values(judgements ?? {}).every((n) => !n))

  // Report a settled user-chosen target, not every keystroke or the default
  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current || !valid || !counts) return
    const timer = setTimeout(() => {
      captureAnalyticsEvent('tolerance_calculated', {
        song_id: sheet.songId,
        sheet_type: sheet.type,
        sheet_difficulty: sheet.difficulty,
        target_achievement: target,
        source,
      })
    }, 800)
    return () => clearTimeout(timer)
  }, [target, valid, counts, sheet.songId, sheet.type, sheet.difficulty, source])

  const update = (value: string) => {
    touched.current = true
    setInput(value)
  }

  const setJudgement = (type: ToleranceNoteType, judgement: ToleranceJudgement, value: number) => {
    setCombination((previous) => ({ ...previous, [type]: { ...previous[type], [judgement]: value } }))
  }

  return (
    <MaterialSurface as="section" className="flex flex-col gap-4 p-4" aria-labelledby="tolerance-heading">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Heading id="tolerance-heading" className="m-0 text-lg font-bold">
            {t('tools:tolerance.section-title')}
          </Heading>
          {source === 'chart_page' && (
            <Link
              to="/songs/$songId/$type/$difficulty/tolerance"
              params={{ songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty }}
              className="link text-sm"
            >
              {t('tools:tolerance.open-page')} →
            </Link>
          )}
        </div>
        <p className="m-0 text-xs text-secondary">{t('tools:tolerance.section-intro')}</p>
      </div>

      {!counts ? (
        <p className="m-0 text-sm text-secondary">{t('tools:tolerance.no-note-counts')}</p>
      ) : (
        <>
          {/* Field and presets share a row at sm+; the error text sits under the row so the chips never shift */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <TextField
                label={t('tools:tolerance.target')}
                value={input}
                onChange={(event) => update(event.target.value)}
                size="small"
                inputProps={{
                  inputMode: 'decimal',
                  'aria-describedby': valid ? undefined : 'tolerance-target-error',
                }}
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                error={!valid}
                className="max-w-48 sm:shrink-0"
              />
              <fieldset className="m-0 p-0 border-0 flex flex-wrap gap-1.5">
                <legend className="sr-only">{t('tools:tolerance.presets')}</legend>
                {TOLERANCE_TARGET_PRESETS.map((preset) => (
                  <Chip
                    key={preset}
                    label={`${preset}%`}
                    size="small"
                    color={target === preset ? 'primary' : 'default'}
                    variant={target === preset ? 'filled' : 'outlined'}
                    aria-pressed={target === preset}
                    onClick={() => update(String(preset))}
                  />
                ))}
              </fieldset>
            </div>
            {!valid && (
              <FormHelperText id="tolerance-target-error" error className="m-0 mx-3.5">
                {t('tools:tolerance.target-invalid')}
              </FormHelperText>
            )}
          </div>

          {valid && result && (
            <>
              {/* The one budget, and what the combination below leaves of it */}
              <div className="glass-inset flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="m-0 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm text-secondary">{t('tools:tolerance.budget-label')}</span>
                    <span className="text-xl font-bold num">{formatPercent(Math.max(0, 101 - target))}%</span>
                    <span className="text-sm num">
                      {t('tools:tolerance.budget-in-greats', { count: budgetTapGreats })}
                    </span>
                  </p>
                  <span
                    className={`inline-flex items-center rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-bold text-white ${
                      result.passes ? 'bg-status-positive' : 'bg-danger'
                    }`}
                  >
                    {result.passes ? t('tools:tolerance.pass') : t('tools:tolerance.fail')}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={t('tools:tolerance.used-label')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(result.usedShare * 100)}
                  className="h-2 w-full overflow-hidden rounded-full bg-black/10"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-[var(--duration-fast)] ${
                      result.passes ? 'bg-accent' : 'bg-danger'
                    }`}
                    style={{ width: `${result.usedShare * 100}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <p role="status" className="m-0 text-sm num">
                    {t('tools:tolerance.expected', { value: formatPercent(result.achievement) })}
                    {' · '}
                    {result.passes
                      ? t('tools:tolerance.remaining', {
                          value: formatPercent(result.remaining),
                          count: result.remainingTapGreats,
                        })
                      : t('tools:tolerance.short', { value: formatPercent(-result.remaining) })}
                  </p>
                  <button
                    type="button"
                    className="link text-sm bg-transparent border-0 p-0 cursor-pointer disabled:cursor-default disabled:no-underline disabled:text-secondary"
                    disabled={empty}
                    onClick={() => setCombination({})}
                  >
                    {t('tools:tolerance.reset')}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="m-0 section-title">{t('tools:tolerance.builder-title')}</h3>
                <p className="m-0 text-xs text-secondary">{t('tools:tolerance.builder-hint')}</p>
              </div>

              <div className="flex flex-col gap-3">
                {rows.map((row) => (
                  <ToleranceRowGroup
                    key={row.type}
                    row={row}
                    combination={combination}
                    onChange={(judgement, value) => setJudgement(row.type, judgement, value)}
                  />
                ))}
              </div>

              <p className="m-0 text-xs text-secondary">{t('tools:tolerance.footnote')}</p>
            </>
          )}
        </>
      )}
    </MaterialSurface>
  )
}

const ToleranceRowGroup: FC<{
  row: ToleranceRow
  combination: ToleranceCombination
  onChange: (judgement: ToleranceJudgement, value: number) => void
}> = ({ row, combination, onChange }) => {
  const { t } = useTranslation(['tools'])
  const headingId = useId()
  const used = combinationUsed(combination, row.type)
  const typeLabel = t(`tools:tolerance.type.${row.type}`)
  return (
    // Phones: the type above its cells. sm+: the type in a left column, so every row lines up and the card stays short
    <div
      role="group"
      aria-labelledby={headingId}
      className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-center sm:gap-2"
    >
      <p id={headingId} className="m-0 flex items-baseline gap-2 text-sm font-medium sm:flex-col sm:gap-0">
        {typeLabel}
        <span className="text-xs font-normal text-secondary num">
          {used > 0
            ? t('tools:tolerance.used-of', { used: formatCount(used), total: formatCount(row.count) })
            : `×${formatCount(row.count)}`}
        </span>
      </p>
      {/* GREAT / GOOD / MISS line up across every type; BREAK adds its two PERFECT drops after them */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
        {row.cells.map((cell) => {
          const value = combination[row.type]?.[cell.judgement] ?? 0
          return (
            <JudgementStepper
              key={cell.judgement}
              typeLabel={typeLabel}
              cell={cell}
              value={value}
              max={row.count - used + value}
              onChange={(next) => onChange(cell.judgement, next)}
            />
          )
        })}
      </div>
    </div>
  )
}

const JudgementStepper: FC<{
  typeLabel: string
  cell: ToleranceCell
  value: number
  max: number
  onChange: (value: number) => void
}> = ({ typeLabel, cell, value, max, onChange }) => {
  const { t } = useTranslation(['tools'])
  const inputId = useId()
  const hintId = useId()
  const judgementLabel = t(`tools:tolerance.judgement.${cell.judgement}`)
  const fullLabel = `${typeLabel} ${judgementLabel}`
  const set = (next: number) => onChange(Math.min(max, Math.max(0, next)))
  const over = value > cell.soloMax
  return (
    <div className="glass-inset flex min-w-0 flex-col gap-1 px-1.5 py-1.5">
      <div className="flex items-start justify-between gap-1 px-0.5">
        <label htmlFor={inputId} className="min-w-0 text-xs font-bold leading-tight">
          {judgementLabel}
        </label>
        <span
          className="shrink-0 whitespace-nowrap text-xs leading-tight text-secondary num"
          title={t('tools:tolerance.rate-title', { value: formatRate(cell.rate) })}
        >
          ×{formatRate(cell.rate)}
        </span>
      </div>
      <div className="flex items-stretch">
        <StepButton
          label={t('tools:tolerance.decrement', { label: fullLabel })}
          disabled={value <= 0}
          onClick={() => set(value - 1)}
        >
          <MdiMinus aria-hidden className="h-4 w-4" />
        </StepButton>
        <input
          id={inputId}
          aria-describedby={hintId}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '')
            set(digits ? Number(digits) : 0)
          }}
          onFocus={(event) => event.target.select()}
          className={`w-0 min-w-0 flex-1 border-0 bg-transparent text-center text-base font-bold num text-fg-1 outline-none focus-visible:rounded-[var(--radius-xs)] focus-visible:ring-2 focus-visible:ring-accent ${
            value === 0 ? 'text-secondary font-normal' : ''
          }`}
        />
        <StepButton
          label={t('tools:tolerance.increment', { label: fullLabel })}
          disabled={value >= max}
          onClick={() => set(value + 1)}
        >
          <MdiPlus aria-hidden className="h-4 w-4" />
        </StepButton>
      </div>
      <span
        id={hintId}
        className={`px-0.5 text-[0.6875rem] leading-tight num ${over ? 'text-danger' : 'text-secondary'}`}
      >
        {cell.capped
          ? t('tools:tolerance.solo-all', { total: formatCount(cell.soloMax) })
          : t('tools:tolerance.solo-max', { total: formatCount(cell.soloMax) })}
      </span>
    </div>
  )
}

const StepButton: FC<{ label: string; disabled: boolean; onClick: () => void; children: ReactNode }> = ({
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
    className="flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border-0 bg-black/6 p-0 text-fg-1 transition-colors hover:bg-black/12 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-black/6"
  >
    {children}
  </button>
)