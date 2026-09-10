import { DifficultyEnum, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { useTranslation } from 'react-i18next'
import { toSupportedLocale } from '@/setup/locale'
import { buildSheetPath } from './sheetLinks'

// Start with songs already receiving search impressions; keep the catalog authoritative.
const FEATURED_SONG_IDS = [
  'Sky Trails',
  'Latent Kingdom',
  'クロノイデア',
  '終焉逃避行',
  '7 Wonders',
  'Regulus',
  'AiAe',
  '雨露霜雪',
  'CITRUS MONSTER',
  'Break The Speakers',
]

export const featuredSearchCharts = FEATURED_SONG_IDS.flatMap((songId) => {
  const song = dxdata.songs.find((song) => song.songId === songId)
  const sheet = song?.sheets.find(
    (sheet) =>
      sheet.difficulty === DifficultyEnum.Master && (sheet.type === TypeEnum.DX || sheet.type === TypeEnum.STD),
  )
  return song && sheet ? [{ title: song.title, path: buildSheetPath({ songId, ...sheet }) }] : []
})

const linkClass =
  'inline-flex min-h-10 items-center py-1 text-blue-800 underline underline-offset-4 hover:text-blue-600'

export function SearchIntroduction() {
  const { t, i18n } = useTranslation(['root'])
  const locale = toSupportedLocale(i18n.language) ?? 'en'

  return (
    <header className="w-full flex flex-col gap-2">
      <h1 className="m-0 text-xl sm:text-2xl font-bold tracking-tight text-balance">
        {t('root:pages.search.heading')}
      </h1>
      <p className="m-0 max-w-3xl text-sm leading-relaxed text-zinc-600 text-pretty">
        {t('root:pages.search.introduction')}
      </p>
      <nav aria-label={t('root:pages.search.explore')} className="flex flex-wrap gap-x-5">
        <a className={linkClass} href={`/rating?locale=${locale}`}>
          {t('root:pages.rating.heading')}
        </a>
        <a className={linkClass} href={`/charts/recent?locale=${locale}`}>
          {t('root:pages.recent.title')}
        </a>
        <a className={linkClass} href={`/charts/trending?locale=${locale}`}>
          {t('root:pages.trending.title')}
        </a>
      </nav>
      <details className="text-sm">
        <summary className="min-h-10 cursor-pointer py-2 font-semibold">{t('root:pages.search.featured')}</summary>
        <ul className="m-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 list-none gap-x-5 p-0">
          {featuredSearchCharts.map((chart) => (
            <li key={chart.path}>
              <a className={linkClass} href={`${chart.path}?locale=${locale}`}>
                {chart.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </header>
  )
}