import type { NoteCounts } from '@gekichumai/dxdata'
import {
  type BreakBudgetJudgement,
  type BudgetJudgement,
  type BudgetPicks,
  type BudgetRow,
  type RegularJudgement,
  type NotePenalty,
  type ToleranceNoteType,
  calculateToleranceBudget,
  evaluateBudget,
  perNotePenalties,
  toToleranceNoteCounts,
} from '@gekichumai/maimai-domain'
import { Chip, FormHelperText, InputAdornment, TextField } from '@mui/material'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { type FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiCheckCircle from '~icons/mdi/check-circle'
import MdiCloseCircle from '~icons/mdi/close-circle'
import MdiMinus from '~icons/mdi/minus'
import MdiPlus from '~icons/mdi/plus'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { MAX_ACHIEVEMENT, TOLERANCE_TARGET_PRESETS, parseNumberInput } from './ratingTools'

export type ToleranceSheet = {
  songId: string
  type: string
  difficulty: string
  noteCounts?: NoteCounts
}

type Judgement = RegularJudgement | BreakBudgetJudgement

/** Grid columns from wide containers up: BREAK-only judgements first, so GREAT / GOOD / MISS line up for every row */
const COLUMNS: readonly Judgement[] = ['perfect50', 'perfect100', 'great', 'good', 'miss']
// At or above a 36.5rem container (wide enough for a four-digit count in every column) the rows share one column grid with a header (`@[36.5rem]:`); below it each row stacks.
// The variant is written out in every class name: UnoCSS only generates classes it finds literally in the source.

const pickCount = (picks: BudgetPicks, type: ToleranceNoteType, judgement: Judgement) => picks[type]?.[judgement] ?? 0
const rowTotal = (picks: BudgetPicks, type: ToleranceNoteType) =>
  Object.values(picks[type] ?? {}).reduce((sum, n) => sum + (n ?? 0), 0)

/**
 * The tolerance calculator as one budget: the margin a target leaves (101% - target), the price of every judgement on
 * this chart in TAP GREATs, and a grid to try a combination of judgements against that margin.
 */
export const ToleranceCalculator: FC<{
  sheet: ToleranceSheet
  source: 'chart_page' | 'tool_page'
  /** Heading level: a section on the chart page, the main content on the tool page */
  headingAs?: 'h2' | 'h3'
}> = ({ sheet, source, headingAs: Heading = 'h2' }) => {
  const { t, i18n } = useTranslation(['tools'])
  const locale = i18n.resolvedLanguage ?? i18n.language
  const [input, setInput] = useState('100.5')
  const [picks, setPicks] = useState<BudgetPicks>({})
  const counts = useMemo(() => toToleranceNoteCounts(sheet.noteCounts), [sheet.noteCounts])
  const target = parseNumberInput(input)
  const valid = target !== null && target > 0 && target <= MAX_ACHIEVEMENT
  const budget = useMemo(
    () => (counts && valid ? calculateToleranceBudget(counts, target) : null),
    [counts, valid, target],
  )
  const penalties = useMemo(() => (counts ? perNotePenalties(counts) : []), [counts])
  const evaluation = useMemo(
    () => (counts && valid ? evaluateBudget(counts, target, picks) : null),
    [counts, valid, target, picks],
  )

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

  const setPick = (row: BudgetRow, judgement: Judgement, value: number) => {
    setPicks((previous) => {
      const others = rowTotal(previous, row.type) - pickCount(previous, row.type, judgement)
      const next = Math.max(0, Math.min(row.count - others, Math.floor(value)))
      return { ...previous, [row.type]: { ...previous[row.type], [judgement]: next } }
    })
  }

  const hasPicks = REGULAR_AND_BREAK.some((type) => rowTotal(picks, type) > 0)
  const number = (value: number, digits: number) =>
    value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const rate = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 })

  return (
    <MaterialSurface as="section" className="@container flex flex-col gap-3 p-4" aria-labelledby="tolerance-heading">
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
        <p className="m-0 text-xs text-secondary text-pretty">{t('tools:tolerance.section-intro')}</p>
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

          {budget && evaluation && (
            <>
              <BudgetPanel
                allowed={number(budget.allowedLoss, 4)}
                allowedInGreats={number(budget.inTapGreats, 2)}
                usedRatio={
                  budget.allowedLoss > 0 ? evaluation.usedLoss / budget.allowedLoss : evaluation.usedLoss > 0 ? 2 : 0
                }
                remaining={number(Math.abs(evaluation.remainingLoss), 4)}
                remainingInGreats={number(
                  budget.tapGreatLoss > 0 ? Math.abs(evaluation.remainingLoss) / budget.tapGreatLoss : 0,
                  2,
                )}
                over={evaluation.remainingLoss < -1e-9}
                achievement={number(evaluation.achievement, 4)}
                pass={evaluation.pass}
                hasPicks={hasPicks}
                onReset={() => setPicks({})}
              />

              <NotePenalties penalties={penalties} percent={(value) => number(value, 4)} rate={rate} />

              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <h3 className="m-0 text-sm font-semibold">{t('tools:tolerance.grid.title')}</h3>
                  <p className="m-0 text-xs text-secondary text-pretty">{t('tools:tolerance.grid.legend')}</p>
                </div>
                <div
                  className={clsx(
                    'flex flex-col gap-3',
                    `@[36.5rem]:grid @[36.5rem]:grid-cols-[minmax(4.5rem,auto)_repeat(5,minmax(0,1fr))] @[36.5rem]:gap-x-1.5 @[36.5rem]:gap-y-1.5`,
                  )}
                >
                  {/* Column header, wide only; narrow cells carry their own judgement label */}
                  <div aria-hidden className={`hidden @[36.5rem]:contents`}>
                    <span className="self-end pb-0.5 text-xs text-secondary">{t('tools:tolerance.note-type')}</span>
                    {COLUMNS.map((judgement) => (
                      <span
                        key={judgement}
                        className="self-end pb-0.5 text-center text-xs font-semibold text-secondary"
                      >
                        {t(`tools:tolerance.judgement.${judgement}`)}
                      </span>
                    ))}
                  </div>

                  {budget.rows.map((row) => {
                    const left = row.count - rowTotal(picks, row.type)
                    return (
                      <div key={row.type} className="flex flex-col gap-1.5 @[36.5rem]:contents">
                        <div
                          className={`flex items-baseline gap-1.5 @[36.5rem]:self-center @[36.5rem]:flex-col @[36.5rem]:gap-0`}
                        >
                          <span className="text-sm font-semibold">{t(`tools:tolerance.type.${row.type}`)}</span>
                          <span className="text-xs text-secondary num">×{row.count.toLocaleString(locale)}</span>
                        </div>
                        <div className={`grid grid-cols-3 gap-1.5 @[36.5rem]:contents`}>
                          {COLUMNS.map((judgement) => {
                            const cell = row.judgements.find((j) => j.judgement === judgement)
                            if (!cell) return <span key={judgement} aria-hidden className={`hidden @[36.5rem]:block`} />
                            const value = pickCount(picks, row.type, judgement)
                            return (
                              <JudgementCell
                                key={judgement}
                                typeLabel={t(`tools:tolerance.type.${row.type}`)}
                                judgementLabel={t(`tools:tolerance.judgement.${judgement}`)}
                                cell={cell}
                                count={row.count}
                                value={value}
                                canAdd={left > 0}
                                rate={rate(cell.inTapGreats)}
                                onChange={(next) => setPick(row, judgement, next)}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <p className="m-0 text-xs text-secondary text-pretty">{t('tools:tolerance.footnote')}</p>
            </>
          )}
        </>
      )}
    </MaterialSurface>
  )
}

const REGULAR_AND_BREAK: readonly ToleranceNoteType[] = ['tap', 'hold', 'slide', 'touch', 'break']

const BudgetPanel: FC<{
  allowed: string
  allowedInGreats: string
  usedRatio: number
  remaining: string
  remainingInGreats: string
  over: boolean
  achievement: string
  pass: boolean
  hasPicks: boolean
  onReset: () => void
}> = ({
  allowed,
  allowedInGreats,
  usedRatio,
  remaining,
  remainingInGreats,
  over,
  achievement,
  pass,
  hasPicks,
  onReset,
}) => {
  const { t } = useTranslation(['tools'])
  const ResultIcon = pass ? MdiCheckCircle : MdiCloseCircle
  return (
    <MaterialSurface variant="thin" className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs font-semibold text-secondary">{t('tools:tolerance.budget.label')}</span>
        <span className="text-2xl font-bold display-num leading-tight">{allowed}%</span>
        <span className="text-sm num">{t('tools:tolerance.budget.in-greats', { value: allowedInGreats })}</span>
      </div>
      <div
        aria-hidden
        className="h-2 overflow-hidden rounded-full glass-inset !border-0 bg-[color-mix(in_oklab,var(--fg-2)_14%,transparent)]"
      >
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
            over ? 'bg-[var(--danger)]' : 'bg-accent-strong',
          )}
          style={{ width: `${Math.min(100, usedRatio * 100)}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        {/* Announced as the grid changes */}
        <output className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm num">
          <span className={clsx(over && 'font-semibold text-[var(--danger)]')}>
            {t(over ? 'tools:tolerance.budget.over' : 'tools:tolerance.budget.remaining', {
              value: remaining,
              greats: remainingInGreats,
            })}
          </span>
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs font-semibold',
              pass
                ? 'bg-[color-mix(in_oklab,var(--status-positive)_16%,transparent)] text-[var(--status-positive)]'
                : 'bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]',
            )}
          >
            <ResultIcon aria-hidden className="size-3.5 shrink-0" />
            {t(pass ? 'tools:tolerance.budget.pass' : 'tools:tolerance.budget.fail', { achievement })}
          </span>
        </output>
        {hasPicks ? (
          <button
            type="button"
            onClick={onReset}
            className="link cursor-pointer border-0 bg-transparent p-0 text-sm font-inherit"
          >
            {t('tools:tolerance.budget.reset')}
          </button>
        ) : (
          <span className="text-xs text-secondary">{t('tools:tolerance.budget.hint')}</span>
        )}
      </div>
    </MaterialSurface>
  )
}

const stepButton =
  'inline-flex h-7 flex-1 @[20rem]:w-7 @[20rem]:flex-none @[36.5rem]:w-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border-0 bg-transparent p-0 text-fg-1 hover:bg-[color-mix(in_oklab,var(--fg-1)_8%,transparent)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent'

const JudgementCell: FC<{
  typeLabel: string
  judgementLabel: string
  cell: BudgetJudgement
  count: number
  value: number
  canAdd: boolean
  rate: string
  onChange: (value: number) => void
}> = ({ typeLabel, judgementLabel, cell, count, value, canAdd, rate, onChange }) => {
  const { t } = useTranslation(['tools'])
  const name = `${typeLabel} ${judgementLabel}`
  const soloClassName = cell.soloAll
    ? 'text-[var(--status-positive)]'
    : cell.soloMax === 0
      ? 'text-[var(--danger)]'
      : 'text-secondary'
  return (
    <div
      className={clsx(
        'flex min-w-0 flex-col gap-0.5 rounded-[var(--radius-md)] glass-inset px-1 py-1.5',
        value > 0 && 'shadow-[inset_0_0_0_1.5px_var(--accent)]',
      )}
    >
      <span className={`px-1 text-[0.6875rem] font-semibold text-secondary @[36.5rem]:sr-only`}>{judgementLabel}</span>
      {/* Under 20rem of card (a 320px phone) the count takes its own line and − / + share the one below, so the digits
          never get squeezed out; wider, they sit on one line */}
      <div className="flex flex-wrap items-center gap-0.5 @[20rem]:flex-nowrap @[36.5rem]:gap-0">
        <button
          type="button"
          className={stepButton}
          aria-label={t('tools:tolerance.grid.decrease', { name })}
          disabled={value <= 0}
          onClick={() => onChange(value - 1)}
        >
          <MdiMinus aria-hidden className="size-4" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label={t('tools:tolerance.grid.count', { name })}
          value={value === 0 ? '' : String(value)}
          placeholder="0"
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value.replace(/[^\d]/g, '') || '0', 10)
            onChange(Number.isFinite(parsed) ? parsed : 0)
          }}
          onFocus={(event) => event.target.select()}
          className="order-first basis-full w-full min-w-0 rounded-[var(--radius-sm)] border-0 bg-transparent p-0 text-center @[20rem]:order-none @[20rem]:basis-auto text-base font-semibold num text-fg-1 placeholder:text-fg-2 placeholder:font-normal focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--accent)]"
        />
        <button
          type="button"
          className={stepButton}
          aria-label={t('tools:tolerance.grid.increase', { name })}
          disabled={!canAdd}
          onClick={() => onChange(value + 1)}
        >
          <MdiPlus aria-hidden className="size-4" />
        </button>
      </div>
      <span
        className="px-1 text-[0.6875rem] leading-tight text-secondary num"
        title={t('tools:tolerance.grid.rate-title', { value: rate })}
      >
        {t('tools:tolerance.grid.rate', { value: rate })}
      </span>
      <span className={clsx('px-1 text-[0.6875rem] leading-tight num', soloClassName)}>
        {cell.soloAll
          ? t('tools:tolerance.grid.solo-all', { count })
          : t('tools:tolerance.grid.solo', { count: cell.soloMax })}
      </span>
    </div>
  )
}
/**
 * What one note of each judgement costs on this chart, next to the budget it is spent from. TAP / HOLD / SLIDE / TOUCH
 * get a small table each; BREAK shows every grade and splits the cost into base score and BREAK bonus.
 */
const NotePenalties: FC<{
  penalties: NotePenalty[]
  percent: (value: number) => string
  rate: (value: number) => string
}> = ({ penalties, percent, rate }) => {
  const { t } = useTranslation(['tools'])
  if (penalties.length === 0) return null
  const types = [...new Set(penalties.map((p) => p.type))]
  const regular = types.filter((type) => type !== 'break')
  const breaks = penalties.filter((p) => p.type === 'break')
  const cost = (value: number) => (value > 0 ? `−${percent(value)}%` : `${percent(0)}%`)
  const label = (p: NotePenalty) =>
    p.breakBase !== undefined
      ? t('tools:tolerance.penalty.great-grade', { score: p.breakBase })
      : t(`tools:tolerance.judgement.${p.judgement}`)
  // Narrow cards use the grid's short "×n" (one costs n TAP GREATs); wide ones spell it out
  const inGreats = (p: NotePenalty) => (
    <>
      <span className="whitespace-nowrap @[30rem]:hidden">
        {t('tools:tolerance.grid.rate', { value: rate(p.inTapGreats) })}
      </span>
      <span className="hidden @[30rem]:inline">
        {t('tools:tolerance.penalty.in-greats', { value: rate(p.inTapGreats) })}
      </span>
    </>
  )
  return (
    <section aria-labelledby="tolerance-penalty-heading" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id="tolerance-penalty-heading" className="m-0 text-sm font-semibold">
          {t('tools:tolerance.penalty.title')}
        </h3>
        <p className="m-0 text-xs text-secondary text-pretty">{t('tools:tolerance.penalty.intro')}</p>
      </div>
      <div className="grid gap-2 @[30rem]:grid-cols-2">
        {regular.map((type) => (
          <table key={type} className="glass-inset w-full border-collapse text-sm num">
            <caption className="px-2.5 pt-1.5 text-left text-xs font-semibold">
              {t(`tools:tolerance.type.${type}`)}
            </caption>
            <tbody>
              {penalties
                .filter((p) => p.type === type)
                .map((p) => (
                  <tr key={p.judgement}>
                    <th scope="row" className="w-[5.5rem] px-2.5 py-0.5 text-left text-xs font-medium">
                      {label(p)}
                    </th>
                    <td className="px-1 py-0.5 text-right font-semibold whitespace-nowrap">{cost(p.total)}</td>
                    <td className="px-2.5 py-0.5 text-right text-xs text-secondary">{inGreats(p)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ))}
      </div>
      {breaks.length > 0 && (
        <table className="glass-inset w-full border-collapse text-sm num">
          <caption className="px-2.5 pt-1.5 text-left text-xs font-semibold">{t('tools:tolerance.type.break')}</caption>
          <thead>
            <tr className="text-xs text-secondary">
              <th scope="col" className="px-2.5 py-0.5 text-left font-medium">
                {t('tools:tolerance.penalty.judgement')}
              </th>
              <th scope="col" className="hidden px-1 py-0.5 text-right font-medium @[30rem]:table-cell">
                {t('tools:tolerance.penalty.base')}
              </th>
              <th scope="col" className="hidden px-1 py-0.5 text-right font-medium @[30rem]:table-cell">
                {t('tools:tolerance.penalty.bonus')}
              </th>
              <th scope="col" className="px-1 py-0.5 text-right font-medium">
                {t('tools:tolerance.penalty.total')}
              </th>
              <th scope="col" className="px-2.5 py-0.5 text-right font-medium">
                <span className="whitespace-nowrap @[30rem]:hidden">TAP GREAT</span>
                <span className="hidden @[30rem]:inline">{t('tools:tolerance.penalty.in-greats-col')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {breaks.map((p) => (
              <tr key={p.judgement} className="align-top">
                <th scope="row" className="px-2.5 py-0.5 text-left text-xs font-medium whitespace-nowrap">
                  {label(p)}
                </th>
                <td className="hidden px-1 py-0.5 text-right text-secondary @[30rem]:table-cell">{cost(p.base)}</td>
                <td className="hidden px-1 py-0.5 text-right text-secondary @[30rem]:table-cell">{cost(p.bonus)}</td>
                <td className="px-1 py-0.5 text-right">
                  <span className="block font-semibold whitespace-nowrap">{cost(p.total)}</span>
                  {/* Narrow cards drop the base / bonus columns; the split moves under the total */}
                  <span className="block text-[0.6875rem] leading-tight text-secondary @[30rem]:hidden">
                    {p.base > 0 ? (
                      <>
                        <span className="block">
                          {t('tools:tolerance.penalty.base-part', { value: percent(p.base) })}
                        </span>
                        <span className="block">
                          {t('tools:tolerance.penalty.bonus-part', { value: percent(p.bonus) })}
                        </span>
                      </>
                    ) : (
                      t('tools:tolerance.penalty.bonus-only')
                    )}
                  </span>
                </td>
                <td className="px-2.5 py-0.5 text-right text-xs text-secondary">{inGreats(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}