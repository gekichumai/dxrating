import { InputAdornment, TextField } from '@mui/material'
import { Link } from '@tanstack/react-router'
import { type FC, type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MaterialSurface } from '@/components/global/MaterialSurface'
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

const LevelField: FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation(['tools'])
  const valid = validLevel(parseNumberInput(value))
  return (
    <TextField
      label={t('tools:rating.internal-level')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      size="small"
      inputProps={{ inputMode: 'decimal' }}
      error={!valid}
      helperText={
        valid ? undefined : t('tools:rating.level-invalid', { min: MIN_INTERNAL_LEVEL, max: MAX_INTERNAL_LEVEL })
      }
      className="flex-1 min-w-32"
    />
  )
}

const ToolSection: FC<{ id: string; title: string; description: string; children: ReactNode }> = ({
  id,
  title,
  description,
  children,
}) => (
  <MaterialSurface as="section" className="flex flex-col gap-3 p-4" aria-labelledby={id}>
    <div className="flex flex-col gap-1">
      <h2 id={id} className="m-0 text-lg font-bold">
        {title}
      </h2>
      <p className="m-0 text-xs text-slate-600 dark:text-slate-400">{description}</p>
    </div>
    {children}
  </MaterialSurface>
)

const Result: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-0.5" aria-live="polite">
    <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
    <span className="text-2xl font-bold tabular-nums">{children}</span>
  </div>
)

const RatingForAchievement: FC = () => {
  const { t } = useTranslation(['tools'])
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
      title={t('tools:rating.forward.title')}
      description={t('tools:rating.forward.description')}
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
          label={t('tools:rating.achievement')}
          value={achievementInput}
          onChange={(event) => {
            touch()
            setAchievementInput(event.target.value)
          }}
          size="small"
          inputProps={{ inputMode: 'decimal' }}
          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
          error={!achievementValid}
          className="flex-1 min-w-32"
        />
      </div>
      <Result label={t('tools:rating.forward.result')}>
        {award ? (
          <>
            {award.ratingAwardValue}{' '}
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {award.rank.toUpperCase().replace('P', '+')}
            </span>
          </>
        ) : (
          '—'
        )}
      </Result>
    </ToolSection>
  )
}

const AchievementForRating: FC = () => {
  const { t } = useTranslation(['tools'])
  const [levelInput, setLevelInput] = useState('13.0')
  const [ratingInput, setRatingInput] = useState('280')
  const level = parseNumberInput(levelInput)
  const target = parseNumberInput(ratingInput)
  const targetValid = target !== null && target >= 0 && Number.isInteger(target)
  const touch = useRatingToolAnalytics('achievement_for_rating', level, [targetValid ? target : null])
  const ready = validLevel(level) && targetValid
  const needed = ready ? minimumAchievementForRating(level, target) : null

  return (
    <ToolSection
      id="achievement-for-rating"
      title={t('tools:rating.reverse.title')}
      description={t('tools:rating.reverse.description')}
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
          label={t('tools:rating.target-rating')}
          value={ratingInput}
          onChange={(event) => {
            touch()
            setRatingInput(event.target.value)
          }}
          size="small"
          inputProps={{ inputMode: 'numeric' }}
          error={!targetValid}
          className="flex-1 min-w-32"
        />
      </div>
      <Result label={t('tools:rating.reverse.result')}>
        {!ready ? '—' : needed === null ? t('tools:rating.reverse.unreachable') : `${needed.toFixed(4)}%`}
      </Result>
    </ToolSection>
  )
}

const TABLE_LEVEL_OFFSETS = [-0.2, -0.1, 0, 0.1, 0.2] as const

const RatingTable: FC = () => {
  const { t } = useTranslation(['tools'])
  const [levelInput, setLevelInput] = useState('13.0')
  const level = parseNumberInput(levelInput)
  const touch = useRatingToolAnalytics('rating_table', level, [])
  const levels = validLevel(level)
    ? [...new Set(TABLE_LEVEL_OFFSETS.map((offset) => clampInternalLevel(level + offset)))]
    : []

  return (
    <ToolSection
      id="rating-table"
      title={t('tools:rating.table.title')}
      description={t('tools:rating.table.description')}
    >
      <div className="flex">
        <LevelField
          value={levelInput}
          onChange={(value) => {
            touch()
            setLevelInput(value)
          }}
        />
      </div>
      {levels.length > 0 && (
        <MaterialSurface variant="thin" className="overflow-x-auto">
          <table className="w-full border-collapse text-sm tabular-nums">
            <caption className="sr-only">{t('tools:rating.table.title')}</caption>
            <thead>
              <tr className="text-xs text-slate-600 dark:text-slate-400">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t('tools:rating.achievement')}
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
                <tr key={achievement} className="border-t border-t-solid border-black/6 dark:border-white/8">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {achievement}%{' '}
                    <span className="text-xs font-normal text-slate-500">
                      {ratingFor(1, achievement).rank.toUpperCase().replace('P', '+')}
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
        </MaterialSurface>
      )}
    </ToolSection>
  )
}

export const RatingToolPage: FC = () => {
  const { t } = useTranslation(['tools'])

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 pb-global flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl font-bold">{t('tools:rating.title')}</h1>
        <p className="m-0 text-sm text-slate-700 dark:text-slate-300">{t('tools:rating.intro')}</p>
        <Link to="/tools/tolerance" className="self-start text-sm text-slate-700 dark:text-slate-300">
          {t('tools:tolerance.title')} →
        </Link>
      </header>
      <RatingForAchievement />
      <AchievementForRating />
      <RatingTable />
    </div>
  )
}