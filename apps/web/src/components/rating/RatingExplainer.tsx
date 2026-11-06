import { calculateRatingAward, SCORE_COEFFICIENT_TABLE } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

const EXAMPLE_CONSTANT = 14.7

/** Display labels for the rank ids of the score coefficient table */
export const RANK_LABELS: Record<string, string> = {
  sssp: 'SSS+',
  sss: 'SSS',
  ssp: 'SS+',
  ss: 'SS',
  sp: 'S+',
  s: 'S',
  aaa: 'AAA',
  aa: 'AA',
  a: 'A',
}

/** The lowest achievement of each rank from A up, highest first: the rows people look up */
export const RANK_COEFFICIENT_ROWS = SCORE_COEFFICIENT_TABLE.filter(
  ([achievement, , rank], index, table) =>
    achievement >= 80 && RANK_LABELS[rank] && table.findIndex(([, , other]) => other === rank) === index,
)
  .map(([achievement, coefficient, rank]) => ({
    label: RANK_LABELS[rank]!,
    achievement,
    coefficient,
    rating: calculateRatingAward(EXAMPLE_CONSTANT, achievement).ratingAwardValue,
  }))
  .reverse()

export const RATING_FAQ_KEYS = ['1', '2', '3', '4'] as const

/** Server-rendered explanation of the rating rules under the calculator, for people and search engines alike */
export const RatingExplainer: FC = () => {
  const { t } = useTranslation(['rating-explainer'])
  const rating = (achievement: number) => calculateRatingAward(EXAMPLE_CONSTANT, achievement).ratingAwardValue

  return (
    // One column under 1024px; on desktop the prose runs on the left and the rank table stays in view on the right,
    // as wide as the calculator above it
    <section
      className="w-full max-w-3xl lg:max-w-7xl min-[1600px]:max-w-[1536px] mx-auto px-4 py-6 flex flex-col gap-4 text-fg-1 lg:grid lg:grid-cols-[minmax(0,65ch)_minmax(340px,1fr)] lg:gap-x-8 lg:items-start"
      aria-labelledby="rating-explainer"
    >
      <h2 id="rating-explainer" className="text-2xl font-bold m-0 lg:col-span-2">
        {t('rating-explainer:title')}
      </h2>
      <p className="m-0 text-base leading-relaxed max-w-[65ch] text-pretty">{t('rating-explainer:intro')}</p>
      <p className="m-0 text-base leading-relaxed max-w-[65ch] text-pretty">
        {t('rating-explainer:single-chart.hint')}{' '}
        <Link to="/tools/rating" className="link">
          {t('rating-explainer:single-chart.link')} →
        </Link>
      </p>

      <h3 className="text-lg font-bold m-0">{t('rating-explainer:formula.title')}</h3>
      <p className="m-0 text-base leading-relaxed max-w-[65ch] text-pretty">{t('rating-explainer:formula.body')}</p>

      <div className="flex flex-col gap-4 lg:col-start-2 lg:[grid-row:2/span_9] lg:sticky lg:top-4 lg:w-full lg:max-w-[420px]">
        <h3 className="text-lg font-bold m-0">{t('rating-explainer:table.title')}</h3>
        <div className="glass overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="text-xs text-secondary text-left">
              <tr>
                <th className="px-4 py-1.5 font-normal">{t('rating-explainer:table.rank')}</th>
                <th className="px-2 py-1.5 font-normal text-right">{t('rating-explainer:table.achievement')}</th>
                <th className="px-2 py-1.5 font-normal text-right">{t('rating-explainer:table.coefficient')}</th>
                <th className="px-4 py-1.5 font-normal text-right">
                  {t('rating-explainer:table.example', { constant: EXAMPLE_CONSTANT.toFixed(1) })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/6">
              {RANK_COEFFICIENT_ROWS.map((row) => (
                <tr key={row.label}>
                  <td className="px-4 py-1.5 font-bold">{row.label}</td>
                  <td className="px-2 py-1.5 text-right num">{row.achievement.toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right num">{row.coefficient.toFixed(1)}</td>
                  <td className="px-4 py-1.5 text-right num">{row.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="text-lg font-bold m-0">{t('rating-explainer:example.title')}</h3>
      <p className="m-0 text-base leading-relaxed max-w-[65ch] text-pretty">
        {t('rating-explainer:example.body', {
          constant: EXAMPLE_CONSTANT.toFixed(1),
          sssp: rating(100.5),
          sss: rating(100),
          ssp: rating(99.5),
        })}
      </p>
      <a href="/constants" className="link self-start text-base">
        {t('rating-explainer:constants.link')}
      </a>

      <h3 className="text-lg font-bold m-0">{t('rating-explainer:faq.title')}</h3>
      <dl className="m-0 flex flex-col gap-3">
        {RATING_FAQ_KEYS.map((key) => (
          <div key={key}>
            <dt className="font-bold text-base">{t(`rating-explainer:faq.q${key}`)}</dt>
            <dd className="m-0 mt-1 text-base leading-relaxed max-w-[65ch] text-pretty">
              {t(`rating-explainer:faq.a${key}`)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}