import { calculateRatingAward, SCORE_COEFFICIENT_TABLE } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import type { FC } from 'react'
import type { PlainMessage } from '@/i18n/message'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { InternalLink } from '@/components/global/InternalLink'

const EXAMPLE_CONSTANT = 14.7

// A glass panel of prose, up to a reading width under 1024px; the grid column sets its width on desktop
const EXPLAINER_CARD_CLASS_NAME = 'glass flex flex-col gap-4 w-full max-w-3xl lg:max-w-none p-4 sm:p-6'
const PROSE_CLASS_NAME = 'm-0 text-base leading-relaxed max-w-[65ch] text-pretty'
// More room above than below, so a heading groups with the text it introduces
const SUBHEADING_CLASS_NAME = 'mt-2 mb-0 first:mt-0 text-lg font-semibold leading-snug'

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
    // The calculator's frame and gutter. Prose sits on glass like the rest of the page, never on the background art.
    // One column under 1024px (cards up to a reading width, left-aligned with the calculator); on desktop the prose
    // cards run on the left and the rank table stays in view on the right, out to the calculator's right edge. The
    // page's last content, so it carries the bottom padding
    <section
      className="page-gutter pt-4 pb-global flex flex-col gap-4 text-fg-1 lg:grid lg:grid-cols-[minmax(0,65ch)_minmax(340px,1fr)] lg:items-start"
      aria-labelledby="rating-explainer"
    >
      <h2 id="rating-explainer" className="text-xl sm:text-2xl font-semibold leading-tight m-0 lg:col-span-2">
        {m.ratingExplainer_title({}, { locale })}
      </h2>

      <div className={EXPLAINER_CARD_CLASS_NAME}>
        <p className={PROSE_CLASS_NAME}>{m.ratingExplainer_intro({}, { locale })}</p>
        <p className={PROSE_CLASS_NAME}>
          {m.ratingExplainer_singleChart_hint({}, { locale })}{' '}
          <Link to="/tools/rating" className="link">
            {m.ratingExplainer_singleChart_link({}, { locale })} →
          </Link>
        </p>

        <h3 className={SUBHEADING_CLASS_NAME}>{m.ratingExplainer_formula_title({}, { locale })}</h3>
        <p className={PROSE_CLASS_NAME}>{m.ratingExplainer_formula_body({}, { locale })}</p>

        <h3 className={SUBHEADING_CLASS_NAME}>{m.ratingExplainer_example_title({}, { locale })}</h3>
        <p className={PROSE_CLASS_NAME}>
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
      </div>

      <div className="flex flex-col gap-3 w-full max-w-3xl lg:max-w-none lg:col-start-2 lg:row-start-2 lg:row-span-2 lg:sticky lg:top-4">
        <h3 className={SUBHEADING_CLASS_NAME}>{m.ratingExplainer_table_title({}, { locale })}</h3>
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

      <div className={clsx(EXPLAINER_CARD_CLASS_NAME, 'lg:col-start-1')}>
        <h3 className={SUBHEADING_CLASS_NAME}>{m.ratingExplainer_faq_title({}, { locale })}</h3>
        <dl className="m-0 flex flex-col gap-4">
          {RATING_FAQ_KEYS.map((key) => (
            <div key={key}>
              <dt className="font-semibold text-base">{FAQ_MESSAGES[key].question({}, { locale })}</dt>
              <dd className={clsx(PROSE_CLASS_NAME, 'mt-1')}>{FAQ_MESSAGES[key].answer({}, { locale })}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}