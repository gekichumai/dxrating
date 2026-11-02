import { calculateRatingAward, SCORE_COEFFICIENT_TABLE } from '@gekichumai/maimai-domain'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

const EXAMPLE_CONSTANT = 14.7

const RANK_LABELS: Record<string, string> = {
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
    <section
      className="w-full max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4 text-slate-800"
      aria-labelledby="rating-explainer"
    >
      <h2 id="rating-explainer" className="text-2xl font-bold text-slate-950 m-0">
        {t('rating-explainer:title')}
      </h2>
      <p className="m-0 text-sm leading-relaxed">{t('rating-explainer:intro')}</p>

      <h3 className="text-lg font-bold text-slate-950 m-0">{t('rating-explainer:formula.title')}</h3>
      <p className="m-0 text-sm leading-relaxed">{t('rating-explainer:formula.body')}</p>

      <h3 className="text-lg font-bold text-slate-950 m-0">{t('rating-explainer:table.title')}</h3>
      <div className="bg-white/90 border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead className="text-xs text-slate-600 text-left">
            <tr>
              <th className="px-4 py-1.5 font-normal">{t('rating-explainer:table.rank')}</th>
              <th className="px-2 py-1.5 font-normal text-right">{t('rating-explainer:table.achievement')}</th>
              <th className="px-2 py-1.5 font-normal text-right">{t('rating-explainer:table.coefficient')}</th>
              <th className="px-4 py-1.5 font-normal text-right">
                {t('rating-explainer:table.example', { constant: EXAMPLE_CONSTANT.toFixed(1) })}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {RANK_COEFFICIENT_ROWS.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-1.5 font-bold">{row.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{row.achievement.toFixed(1)}%</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{row.coefficient.toFixed(1)}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">{row.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-lg font-bold text-slate-950 m-0">{t('rating-explainer:example.title')}</h3>
      <p className="m-0 text-sm leading-relaxed">
        {t('rating-explainer:example.body', {
          constant: EXAMPLE_CONSTANT.toFixed(1),
          sssp: rating(100.5),
          sss: rating(100),
          ssp: rating(99.5),
        })}
      </p>
      <a href="/constants" className="self-start text-sm">
        {t('rating-explainer:constants.link')}
      </a>

      <h3 className="text-lg font-bold text-slate-950 m-0">{t('rating-explainer:faq.title')}</h3>
      <dl className="m-0 flex flex-col gap-3">
        {RATING_FAQ_KEYS.map((key) => (
          <div key={key}>
            <dt className="font-bold text-sm">{t(`rating-explainer:faq.q${key}`)}</dt>
            <dd className="m-0 mt-1 text-sm leading-relaxed">{t(`rating-explainer:faq.a${key}`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}