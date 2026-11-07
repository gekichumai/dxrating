import { Breadcrumb } from '@/components/completion/TableChrome'
import { InputAdornment, TextField } from '@mui/material'
import { Link } from '@tanstack/react-router'
import { type FC, type ReactNode, useEffect, useRef, useState } from 'react'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { RANK_LABELS } from '@/components/rating/RatingExplainer'
import {
  MAX_INTERNAL_LEVEL,
  MIN_INTERNAL_LEVEL,
  RATING_TABLE_ACHIEVEMENTS,
  clampInternalLevel,
  minimumAchievementForRating,
  parseNumberInput,
  ratingFor,
} from '@/components/tools/ratingTools'
import { type RatingToolKind, captureAnalyticsEvent } from '@/lib/analytics'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const rankLabel = (rank: string) => RANK_LABELS[rank] ?? rank.toUpperCase()

const validLevel = (value: number | null): value is number =>
  value !== null && value >= MIN_INTERNAL_LEVEL && value <= MAX_INTERNAL_LEVEL

/** Reports a settled user input per tool, never the defaults */
function useRatingToolAnalytics(tool: RatingToolKind, level: number | null, deps: readonly unknown[]) {
  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current || !validLevel(level)) return
    const timer = setTimeout(() => captureAnalyticsEvent('rating_tool_used', { tool, internal_level: level }), 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, level, ...deps])
  return () => {
    touched.current = true
  }
}

/** Pair fields share a row; capped at sm+ so a 4-character value doesn't stretch across a wide column */
const PAIR_FIELD_CLASS = 'flex-1 min-w-32 sm:max-w-56'

const LevelField: FC<{ value: string; onChange: (value: string) => void; className?: string }> = ({
  value,
  onChange,
  className = PAIR_FIELD_CLASS,
}) => {
  const locale = useLocale()
  const valid = validLevel(parseNumberInput(value))
  return (
    <TextField
      label={m.tools_rating_internalLevel({}, { locale })}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      size="small"
      inputProps={{ inputMode: 'decimal' }}
      error={!valid}
      helperText={
        valid
          ? undefined
          : m.tools_rating_levelInvalid({ min: MIN_INTERNAL_LEVEL, max: MAX_INTERNAL_LEVEL }, { locale })
      }
      className={className}
    />
  )
}

const ToolSection: FC<{
  id: string
  title: string
  description: string
  /** Shown under the heading on mobile and beside it at sm+ */
  headerAction?: ReactNode
  className?: string
  children: ReactNode
}> = ({ id, title, description, headerAction, className, children }) => {
  const heading = (
    <div className="flex flex-col gap-1 min-w-0">
      <h2 id={id} className="m-0 text-lg font-bold">
        {title}
      </h2>
      <p className="m-0 text-sm text-secondary">{description}</p>
    </div>
  )
  return (
    <MaterialSurface as="section" className={`flex flex-col gap-3 p-4 ${className ?? ''}`} aria-labelledby={id}>
      {headerAction ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {heading}
          {headerAction}
        </div>
      ) : (
        heading
      )}
      {children}
    </MaterialSurface>
  )
}

/** The value `announce` describes, once typing has settled (the same 800ms as analytics), so a screen reader hears the
 result once instead of on every keystroke. The region is always mounted, so its first update is announced too */
function useSettled(value: string) {
  const [settled, setSettled] = useState('')
  const first = useRef(true)
  useEffect(() => {
    // Nothing to announce before the visitor has changed an input
    if (first.current) {
      first.current = false
      return
    }
    const timer = setTimeout(() => setSettled(value), 800)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

const Result: FC<{ label: string; announce: string; children: ReactNode }> = ({ label, announce, children }) => {
  const settled = useSettled(`${label}: ${announce}`)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-secondary">{label}</span>
      <span className="text-2xl font-bold display-num">{children}</span>
      <p role="status" className="sr-only">
        {settled}
      </p>
    </div>
  )
}

const RatingForAchievement: FC = () => {
  const locale = useLocale()
  const [levelInput, setLevelInput] = useState('13.0')
  const [achievementInput, setAchievementInput] = useState('100.5')
  const level = parseNumberInput(levelInput)
  const achievement = parseNumberInput(achievementInput)
  const achievementValid = achievement !== null && achievement >= 0 && achievement <= 101
  const touch = useRatingToolAnalytics('rating_for_achievement', level, [achievementValid ? achievement : null])
  const award = validLevel(level) && achievementValid ? ratingFor(level, achievement) : null

  return (
    <ToolSection
      id="rating-for-achievement"
      title={m.tools_rating_forward_title({}, { locale })}
      description={m.tools_rating_forward_description({}, { locale })}
    >
      <div className="flex flex-wrap gap-2">
        <LevelField
          value={levelInput}
          onChange={(value) => {
            touch()
            setLevelInput(value)
          }}
        />
        <TextField
          label={m.tools_rating_achievement({}, { locale })}
          value={achievementInput}
          onChange={(event) => {
            touch()
            setAchievementInput(event.target.value)
          }}
          size="small"
          inputProps={{ inputMode: 'decimal' }}
          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
          error={!achievementValid}
          helperText={achievementValid ? undefined : m.tools_rating_achievementInvalid({}, { locale })}
          className={PAIR_FIELD_CLASS}
        />
      </div>
      <Result
        label={m.tools_rating_forward_result({}, { locale })}
        announce={award ? `${award.ratingAwardValue} ${rankLabel(award.rank)}` : '—'}
      >
        {award ? (
          <>
            {award.ratingAwardValue} <span className="text-sm font-medium text-secondary">{rankLabel(award.rank)}</span>
          </>
        ) : (
          '—'
        )}
      </Result>
    </ToolSection>
  )
}

const AchievementForRating: FC = () => {
  const locale = useLocale()
  const [levelInput, setLevelInput] = useState('13.0')
  const [ratingInput, setRatingInput] = useState('280')
  const level = parseNumberInput(levelInput)
  const target = parseNumberInput(ratingInput)
  const targetValid = target !== null && target >= 0 && Number.isInteger(target)
  const touch = useRatingToolAnalytics('achievement_for_rating', level, [targetValid ? target : null])
  const ready = validLevel(level) && targetValid
  const needed = ready ? minimumAchievementForRating(level, target) : null
  const neededText = !ready
    ? '—'
    : needed === null
      ? m.tools_rating_reverse_unreachable({}, { locale })
      : `${needed.toFixed(4)}%`

  return (
    <ToolSection
      id="achievement-for-rating"
      title={m.tools_rating_reverse_title({}, { locale })}
      description={m.tools_rating_reverse_description({}, { locale })}
    >
      <div className="flex flex-wrap gap-2">
        <LevelField
          value={levelInput}
          onChange={(value) => {
            touch()
            setLevelInput(value)
          }}
        />
        <TextField
          label={m.tools_rating_targetRating({}, { locale })}
          value={ratingInput}
          onChange={(event) => {
            touch()
            setRatingInput(event.target.value)
          }}
          size="small"
          inputProps={{ inputMode: 'numeric' }}
          error={!targetValid}
          helperText={targetValid ? undefined : m.tools_rating_targetInvalid({}, { locale })}
          className={PAIR_FIELD_CLASS}
        />
      </div>
      <Result label={m.tools_rating_reverse_result({}, { locale })} announce={neededText}>
        {neededText}
      </Result>
    </ToolSection>
  )
}

const TABLE_LEVEL_OFFSETS = [-0.2, -0.1, 0, 0.1, 0.2] as const

const RatingTable: FC = () => {
  const locale = useLocale()
  const [levelInput, setLevelInput] = useState('13.0')
  const level = parseNumberInput(levelInput)
  const touch = useRatingToolAnalytics('rating_table', level, [])
  const levels = validLevel(level)
    ? [...new Set(TABLE_LEVEL_OFFSETS.map((offset) => clampInternalLevel(level + offset)))]
    : []

  return (
    <ToolSection
      id="rating-table"
      title={m.tools_rating_table_title({}, { locale })}
      description={m.tools_rating_table_description({}, { locale })}
      className="lg:sticky lg:top-4"
      headerAction={
        <LevelField
          value={levelInput}
          onChange={(value) => {
            touch()
            setLevelInput(value)
          }}
          className="w-full sm:w-40 sm:shrink-0"
        />
      }
    >
      {levels.length > 0 && (
        <MaterialSurface variant="thin" className="overflow-hidden">
          <div className="scroll-fade-x overflow-x-auto">
            <table className="w-full border-collapse text-sm num">
              <caption className="sr-only">{m.tools_rating_table_title({}, { locale })}</caption>
              <thead>
                <tr className="text-xs text-secondary">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    {m.tools_rating_achievement({}, { locale })}
                  </th>
                  {levels.map((value) => (
                    <th
                      key={value}
                      scope="col"
                      className={`px-3 py-2 text-right font-medium ${value === clampInternalLevel(level!) ? 'text-inherit font-bold' : ''}`}
                    >
                      {value.toFixed(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RATING_TABLE_ACHIEVEMENTS.map((achievement) => (
                  <tr key={achievement} className="border-t border-t-solid border-black/6">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {achievement}%{' '}
                      <span className="text-xs font-normal text-secondary">
                        {rankLabel(ratingFor(1, achievement).rank)}
                      </span>
                    </th>
                    {levels.map((value) => (
                      <td
                        key={value}
                        className={`px-3 py-2 text-right ${value === clampInternalLevel(level!) ? 'font-bold' : ''}`}
                      >
                        {ratingFor(value, achievement).ratingAwardValue}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MaterialSurface>
      )}
    </ToolSection>
  )
}

export const RatingToolPage: FC = () => {
  const locale = useLocale()

  return (
    <div className="w-full max-w-2xl lg:max-w-6xl mx-auto px-4 py-6 pb-global flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        {/* The tools are not tabs of the main navigation: the breadcrumb is the way back */}
        <Breadcrumb items={[{ label: m.tools_rating_title({}, { locale }) }]} />
        <h1 className="page-title m-0">{m.tools_rating_title({}, { locale })}</h1>
        <p className="page-description m-0">{m.tools_rating_intro({}, { locale })}</p>
        <Link to="/tools/tolerance" className="link self-start text-sm">
          {m.tools_tolerance_title({}, { locale })} →
        </Link>
      </header>
      {/* Stacked on mobile; at lg the calculators sit left of the table so the whole tool fits above the fold */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <RatingForAchievement />
          <AchievementForRating />
        </div>
        <RatingTable />
      </div>
    </div>
  )
}