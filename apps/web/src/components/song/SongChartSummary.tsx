import { useTranslation } from 'react-i18next'
import { toSupportedLocale } from '@/setup/locale'
import type { FlattenedSheet } from '@/songs'
import { useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { getSheetTitleLabel } from './sheetDisplay'

export function SongChartSummary({ sheet }: { sheet: FlattenedSheet }) {
  const { t, i18n } = useTranslation(['song', 'sheet', 'root'])
  const locale = toSupportedLocale(i18n.language) ?? 'en'
  const version = useAppContextDXDataVersion()
  const facts = [
    { label: t('sheet:details.bpm'), value: sheet.bpm !== null && sheet.bpm > 0 ? sheet.bpm : null },
    {
      label: t('song:summary.internal-level'),
      value: !sheet.isTypeUtage && sheet.internalLevelValue > 0 ? sheet.internalLevelValue.toFixed(1) : null,
    },
    { label: t('song:summary.version'), value: version },
    {
      label: t('sheet:details.regional-availability'),
      value: Object.entries(sheet.regions)
        .filter(([, available]) => available)
        .map(([region]) => region.toUpperCase())
        .join(' · '),
    },
  ].filter((fact) => fact.value !== null && fact.value !== '')

  return (
    <section aria-label={t('song:summary.title')} className="flex flex-col gap-2">
      <p className="m-0 text-sm leading-relaxed text-zinc-600">
        {t('song:summary.description', { title: sheet.title, chart: getSheetTitleLabel(sheet, locale) })}
      </p>
      <dl className="m-0 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {facts.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="m-0 font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {!sheet.isTypeUtage && (
        <a
          className="inline-flex self-start min-h-10 items-center text-sm text-blue-800 underline underline-offset-4"
          href={`/rating?locale=${locale}`}
        >
          {t('root:pages.rating.heading')}
        </a>
      )}
    </section>
  )
}