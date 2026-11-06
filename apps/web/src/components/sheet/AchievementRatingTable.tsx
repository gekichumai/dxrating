import clsx from 'clsx'
import { type FC, memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { calculateRating } from '../../utils/rating'
import { DXRank } from '../global/DXRank'

export const PRESET_ACHIEVEMENT_RATES = [100.5, 100, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50]

export const SheetAchievementRate: FC<{ value: number }> = ({ value }) => {
  const integer = Math.floor(value)
  const decimal = value % 1

  return (
    <span className="inline-flex items-center num">
      <span className="font-semibold">{integer}</span>
      <span>.</span>
      <span className={clsx(decimal === 0 && 'text-fg-2')}>{decimal.toFixed(4).slice(2)}</span>
      <span>%</span>
    </span>
  )
}

const cellBorder = 'border-0 border-t border-solid border-[var(--glass-border)]'

/**
 * The rating each preset achievement gives on a chart, with the rating gained over the row below in its own column.
 * The player's own achievement, when given, is added as a row and marked with a tinted background and a tag.
 */
export const AchievementRatingTable: FC<{ internalLevelValue: number; currentAchievementRate?: number }> = memo(
  ({ internalLevelValue, currentAchievementRate }) => {
    const { t } = useTranslation(['sheet', 'global'])
    const ratings = useMemo(() => {
      const rates = [...PRESET_ACHIEVEMENT_RATES]
      if (currentAchievementRate && !rates.includes(currentAchievementRate)) {
        rates.push(currentAchievementRate)
      }
      rates.sort((a, b) => b - a)
      return rates.map((rate) => ({
        achievementRate: rate,
        rating: calculateRating(internalLevelValue, rate),
      }))
    }, [internalLevelValue, currentAchievementRate])

    return (
      <table className="w-full max-w-[26rem] border-collapse num text-sm text-fg-1">
        <thead>
          <tr className="text-xs text-fg-2">
            <th scope="col" colSpan={2} className="px-2 pb-1.5 text-start font-normal">
              {t('sheet:details.achievement-to-rating.achievement')}
            </th>
            <th scope="col" className="px-2 pb-1.5 text-end font-normal">
              {t('sheet:details.achievement-to-rating.rating')}
            </th>
            <th scope="col" className="px-2 pb-1.5 text-end font-normal">
              {t('sheet:details.achievement-to-rating.step-label')}
            </th>
          </tr>
        </thead>
        <tbody>
          {ratings.map((rating, i) => {
            const nextRating = ratings[i + 1]
            const step = nextRating ? rating.rating.ratingAwardValue - nextRating.rating.ratingAwardValue : null
            const isCurrent = rating.achievementRate === currentAchievementRate

            return (
              <tr
                key={rating.achievementRate}
                className={clsx(
                  isCurrent &&
                    'bg-accent-subtle [&>*:first-child]:rounded-s-[var(--radius-sm)] [&>*:last-child]:rounded-e-[var(--radius-sm)]',
                )}
              >
                <td className={clsx(cellBorder, 'w-16 py-1 ps-2 pe-1')}>
                  {/* Rank artwork differs in width; a fixed box keeps the achievement column aligned */}
                  <div className="flex h-7 w-14 items-center justify-center">
                    <DXRank rank={rating.rating.rank} className="block h-7 max-w-full object-contain" />
                  </div>
                </td>
                <th scope="row" className={clsx(cellBorder, 'px-1 py-1 text-start font-normal')}>
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <SheetAchievementRate value={rating.achievementRate} />
                    {isCurrent && (
                      <span className="rounded-[var(--radius-xs)] bg-accent px-1 py-px text-[0.6875rem] font-semibold leading-tight text-on-accent">
                        {t('global:current')}
                      </span>
                    )}
                  </span>
                </th>
                <td className={clsx(cellBorder, 'px-2 py-1 text-end font-semibold')}>
                  {rating.rating.ratingAwardValue}
                </td>
                <td className={clsx(cellBorder, 'w-12 px-2 py-1 text-end text-xs text-fg-2')}>
                  {step !== null && (
                    <>
                      <span aria-hidden="true">+{step}</span>
                      <span className="sr-only">{t('sheet:details.achievement-to-rating.step', { value: step })}</span>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  },
)
AchievementRatingTable.displayName = 'memo(AchievementRatingTable)'