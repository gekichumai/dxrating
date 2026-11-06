import type { NoteCounts } from '@gekichumai/dxdata'
import { toToleranceNoteCounts } from '@gekichumai/maimai-domain'
import { Chip, FormHelperText, InputAdornment, TextField } from '@mui/material'
import { type FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { captureAnalyticsEvent } from '@/lib/analytics'
import {
  MAX_ACHIEVEMENT,
  TOLERANCE_TARGET_PRESETS,
  calculateTolerance,
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

export const ToleranceCalculator: FC<{
  sheet: ToleranceSheet
  source: 'chart_page' | 'tool_page'
  /** Heading level: a section on the chart page, the main content on the tool page */
  headingAs?: 'h2' | 'h3'
}> = ({ sheet, source, headingAs: Heading = 'h2' }) => {
  const { t } = useTranslation(['tools'])
  const [input, setInput] = useState('100.5')
  const counts = useMemo(() => toToleranceNoteCounts(sheet.noteCounts), [sheet.noteCounts])
  const target = parseNumberInput(input)
  const valid = target !== null && target > 0 && target <= MAX_ACHIEVEMENT
  const result = useMemo(() => (counts && valid ? calculateTolerance(counts, target) : null), [counts, valid, target])
  const rows = useMemo(() => (counts && result ? toleranceRows(counts, result) : []), [counts, result])

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

  return (
    <MaterialSurface as="section" className="flex flex-col gap-3 p-4" aria-labelledby="tolerance-heading">
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

          {/* Always mounted, so the first result is announced as well */}
          <p role="status" className="sr-only">
            {result ? t('tools:tolerance.allowed-loss', { value: result.allowedLoss.toFixed(4) }) : ''}
          </p>
          {result && (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-sm num">
                {t('tools:tolerance.allowed-loss', { value: result.allowedLoss.toFixed(4) })}
              </p>
              <MaterialSurface variant="thin" className="overflow-hidden">
                <div className="scroll-fade-x overflow-x-auto">
                  <table className="w-full border-collapse text-sm num">
                    <thead>
                      <tr className="text-left text-xs text-secondary">
                        <th scope="col" className="px-3 py-2 font-medium">
                          {t('tools:tolerance.note-type')}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">
                          GREAT
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">
                          GOOD
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">
                          MISS
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.type} className="border-t border-t-solid border-black/6">
                          <th scope="row" className="px-3 py-2 text-left font-medium">
                            {t(`tools:tolerance.type.${row.type}`)}{' '}
                            <span className="text-xs font-normal text-secondary">×{formatCount(row.count)}</span>
                          </th>
                          <td className="px-3 py-2 text-right">{formatCount(row.great)}</td>
                          <td className="px-3 py-2 text-right">{formatCount(row.good)}</td>
                          <td className="px-3 py-2 text-right">{formatCount(row.miss)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MaterialSurface>
              {counts.break > 0 && (
                <dl className="m-0 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <BreakStat label={t('tools:tolerance.break-50')} value={formatCount(result.maxBreak50)} />
                  <BreakStat label={t('tools:tolerance.break-100')} value={formatCount(result.maxBreak100)} />
                  <BreakStat
                    label={t('tools:tolerance.break-50-per-great')}
                    value={result.break50PerTapGreat.toFixed(2)}
                  />
                </dl>
              )}
              <p className="m-0 text-xs text-secondary">{t('tools:tolerance.footnote')}</p>
            </div>
          )}
        </>
      )}
    </MaterialSurface>
  )
}

const BreakStat: FC<{ label: string; value: string }> = ({ label, value }) => (
  // Cards stretch to the tallest label in their row; pinning each value to the bottom keeps the values aligned
  <MaterialSurface variant="thin" className="flex flex-col justify-between gap-0.5 px-3 py-2">
    <dt className="text-xs text-secondary">{label}</dt>
    <dd className="m-0 text-base font-bold num">{value}</dd>
  </MaterialSurface>
)