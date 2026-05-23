import { type FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SearchSeedSheet } from './searchSeed'

export const SearchSeedList: FC<{ sheets: readonly SearchSeedSheet[] }> = ({ sheets }) => {
  const { t } = useTranslation(['sheet'])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (hydrated || sheets.length === 0) {
    return null
  }

  return (
    <section
      className="w-full border border-slate-200 rounded-lg bg-white p-4 shadow-sm"
      aria-label={t('sheet:search-seed.title')}
      data-testid="search-seed-list"
    >
      <h2 className="text-lg font-bold mb-3">{t('sheet:search-seed.title')}</h2>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {sheets.map((sheet) => (
          <li key={`${sheet.songId}-${sheet.type}-${sheet.difficulty}`}>
            <a className="flex items-baseline gap-2 text-blue-900 hover:underline" href={sheet.path}>
              <span className="font-semibold">{sheet.title}</span>
              <span className="text-slate-600">
                {sheet.type.toUpperCase()} {sheet.difficulty} {t('sheet:search-seed.level', { level: sheet.level })}
              </span>
              {sheet.releaseDate && (
                <time className="ml-auto text-slate-500" dateTime={sheet.releaseDate}>
                  {sheet.releaseDate}
                </time>
              )}
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}