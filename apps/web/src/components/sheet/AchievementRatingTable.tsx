import clsx from 'clsx'
import { type FC, memo, useMemo } from 'react'
import { calculateRating } from '../../utils/rating'
import { DXRank } from '../global/DXRank'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const PRESET_ACHIEVEMENT_RATES = [100.5, 100, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50]

/** S and above go in the first column, AAA and below in the second */
const S_RANK_THRESHOLD = 97

/**
 * The shortest exact form of an achievement: `100.5%` for a threshold, `99.1234%` for a played score.
 * Independent of locale, so the server and the client render the same text.
 */
export const formatAchievementRate = (value: number) => `${Number(value.toFixed(4))}%`

interface RatingRow {
  achievementRate: number
  rating: ReturnType<typeof calculateRating>
}

/**
 * How far into its canvas each rank's artwork starts, as a share of the image width (averaged over the versions'
 * artwork, which agree within about 3%). The artwork is centred on a canvas of the same width for every rank, so
 * shifting it back by this much lines up the left edges of the letters.
 */
const RANK_ARTWORK_INSET: Record<string, number> = {
  sssp: 0.06,
  sss: 0.125,
  ssp: 0.17,
  ss: 0.245,
  sp: 0.3,
  s: 0.37,
  aaa: 0.165,
  aa: 0.255,
  a: 0.345,
  bbb: 0.185,
  bb: 0.275,
  b: 0.365,
  c: 0.355,
  d: 0.355,
}

const cellBorder = 'border-0 border-t border-solid border-[var(--glass-border)]'

const RatingColumn: FC<{
  rows: RatingRow[]
  currentAchievementRate?: number
  /** Shown only when the columns sit side by side; stacked, it is visually hidden but still labels its rows for screen readers */
  headerVisibleOnlyWhenSplit?: boolean
}> = ({ rows, currentAchievementRate, headerVisibleOnlyWhenSplit }) => {
  const locale = useLocale()

  return (
    <table className="w-full border-collapse num text-sm text-fg-1">
      <thead className={clsx(headerVisibleOnlyWhenSplit && 'sr-only @[34rem]:not-sr-only')}>
        <tr className="text-xs text-fg-2">
          <th scope="col" colSpan={2} className="px-2 pb-1 text-start font-normal">
            {m.sheet_details_achievementToRating_achievement({}, { locale })}
          </th>
          <th scope="col" className="px-2 pb-1 text-end font-normal">
            {m.sheet_details_achievementToRating_rating({}, { locale })}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isCurrent = row.achievementRate === currentAchievementRate

          return (
            <tr
              key={row.achievementRate}
              className={clsx(
                'h-8',
                isCurrent &&
                  'bg-accent-subtle [&>*:first-child]:rounded-s-[var(--radius-sm)] [&>*:last-child]:rounded-e-[var(--radius-sm)]',
              )}
            >
              <td className={clsx(cellBorder, 'w-16 py-1 ps-2 pe-0 align-middle')}>
                <span
                  className="block w-fit"
                  style={{ transform: `translateX(-${(RANK_ARTWORK_INSET[row.rating.rank] ?? 0) * 100}%)` }}
                >
                  <DXRank rank={row.rating.rank} className="block h-6 w-auto" />
                </span>
              </td>
              <th scope="row" className={clsx(cellBorder, 'px-1 py-1 text-start align-middle font-normal')}>
                <span className="inline-flex items-center gap-2">
                  {formatAchievementRate(row.achievementRate)}
                  {isCurrent && (
                    <span className="rounded-[var(--radius-xs)] bg-accent px-1 py-px text-[0.6875rem] font-semibold leading-tight text-on-accent">
                      {m.global_current({}, { locale })}
                    </span>
                  )}
                </span>
              </th>
              <td className={clsx(cellBorder, 'px-2 py-1 text-end align-middle font-semibold')}>
                {row.rating.ratingAwardValue}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * The rating each preset achievement gives on a chart. When the container is wide enough the rows split into
 * two columns, S and above beside AAA and below; narrower, they stack into one list.
 * The player's own achievement, when given, is added as a row and marked with a tinted background and a tag.
 */
export const AchievementRatingTable: FC<{ internalLevelValue: number; currentAchievementRate?: number }> = memo(
  ({ internalLevelValue, currentAchievementRate }) => {
    const [upper, lower] = useMemo(() => {
      const rates = [...PRESET_ACHIEVEMENT_RATES]
      if (currentAchievementRate && !rates.includes(currentAchievementRate)) {
        rates.push(currentAchievementRate)
      }
      rates.sort((a, b) => b - a)
      const rows = rates.map((rate) => ({
        achievementRate: rate,
        rating: calculateRating(internalLevelValue, rate),
      }))
      return [
        rows.filter((row) => row.achievementRate >= S_RANK_THRESHOLD),
        rows.filter((row) => row.achievementRate < S_RANK_THRESHOLD),
      ]
    }, [internalLevelValue, currentAchievementRate])

    return (
      <div className="@container">
        <div className="grid grid-cols-1 items-start @[34rem]:grid-cols-2 @[34rem]:gap-x-6">
          <RatingColumn rows={upper} currentAchievementRate={currentAchievementRate} />
          <RatingColumn rows={lower} currentAchievementRate={currentAchievementRate} headerVisibleOnlyWhenSplit />
        </div>
      </div>
    )
  },
)
AchievementRatingTable.displayName = 'memo(AchievementRatingTable)'