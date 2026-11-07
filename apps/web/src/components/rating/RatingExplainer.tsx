import { calculateRatingAward, SCORE_COEFFICIENT_TABLE } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import type { FC } from 'react'
import type { PlainMessage } from '@/i18n/message'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { InternalLink } from '@/components/global/InternalLink'

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

const FAQ_MESSAGES = {
  '1': { question: m.ratingExplainer_faq_q1, answer: m.ratingExplainer_faq_a1 },
  '2': { question: m.ratingExplainer_faq_q2, answer: m.ratingExplainer_faq_a2 },
  '3': { question: m.ratingExplainer_faq_q3, answer: m.ratingExplainer_faq_a3 },
  '4': { question: m.ratingExplainer_faq_q4, answer: m.ratingExplainer_faq_a4 },
} satisfies Record<(typeof RATING_FAQ_KEYS)[number], { question: PlainMessage; answer: PlainMessage }>

/** Server-rendered explanation of the rating rules under the calculator, for people and search engines alike */
export const RatingExplainer: FC = () => {
  const locale = useLocale()
  const rating = (achievement: number) => calculateRatingAward(EXAMPLE_CONSTANT, achievement).ratingAwardValue

  return (
    // One column under 1024px; on desktop the prose runs on the left and the rank table stays in view on the right,
    // as wide as the calculator above it
    <section
      className="w-full max-w-3xl lg:max-w-7xl mx-auto px-4 py-6 flex flex-col gap-4 text-fg-1 lg:grid lg:grid-cols-[minmax(0,65ch)_minmax(340px,1fr)] lg:gap-x-8 lg:items-start"
      aria-labelledby="rating-explainer"
    >
      <h2 id="rating-explainer" className="text-2xl font-bold m-0 lg:col-span-2">
        {m.ratingExplainer_title({}, { locale })}
      </h2>
      <p className="m-0 text-base leading-relaxed max-w-[65ch] text-pretty">
        {m.ratingExplainer_intro({}, { locale })}
      </p>
      <p className="m-0 text-base leading-relaxed max-w-[65ch] text-pretty">
        {m.ratingExplainer_singleChart_hint({}, { locale })}{' '}
        <Link to="/tools/rating" className="link">
          {m.ratingExplainer_singleChart_link({}, { locale })} →
        </Link>
      </p>

      <h3 className="text-lg font-bold m-0">{m.ratingExplainer_formula_title({}, { locale })}</h3>
      <p className="m-0 text-base leading-relaxed max-w-[65ch] text-pretty">
        {m.ratingExplainer_formula_body({}, { locale })}
      </p>

      <div className="flex flex-col gap-4 lg:col-start-2 lg:[grid-row:2/span_9] lg:sticky lg:top-4 lg:w-full lg:max-w-[420px]">
        <h3 className="text-lg font-bold m-0">{m.ratingExplainer_table_title({}, { locale })}</h3>
        <div className="glass overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="text-xs text-secondary text-left">
              <tr>
                <th className="px-4 py-1.5 font-normal">{m.ratingExplainer_table_rank({}, { locale })}</th>
                <th className="px-2 py-1.5 font-normal text-right">
                  {m.ratingExplainer_table_achievement({}, { locale })}
                </th>
                <th className="px-2 py-1.5 font-normal text-right">
                  {m.ratingExplainer_table_coefficient({}, { locale })}
                </th>
                <th className="px-4 py-1.5 font-normal text-right">
                  {m.ratingExplainer_table_example({ constant: EXAMPLE_CONSTANT.toFixed(1) }, { locale })}
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

      <h3 className="text-lg font-bold m-0">{m.ratingExplainer_example_title({}, { locale })}</h3>
      <p className="m-0 text-base leading-relaxed max-w-[65ch] text-pretty">
        {m.ratingExplainer_example_body(
          {
            constant: EXAMPLE_CONSTANT.toFixed(1),
            sssp: rating(100.5),
            sss: rating(100),
            ssp: rating(99.5),
          },
          { locale },
        )}
      </p>
      <InternalLink href="/constants" className="link self-start text-base">
        {m.ratingExplainer_constants_link({}, { locale })}
      </InternalLink>

      <h3 className="text-lg font-bold m-0">{m.ratingExplainer_faq_title({}, { locale })}</h3>
      <dl className="m-0 flex flex-col gap-3">
        {RATING_FAQ_KEYS.map((key) => (
          <div key={key}>
            <dt className="font-bold text-base">{FAQ_MESSAGES[key].question({}, { locale })}</dt>
            <dd className="m-0 mt-1 text-base leading-relaxed max-w-[65ch] text-pretty">
              {FAQ_MESSAGES[key].answer({}, { locale })}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}