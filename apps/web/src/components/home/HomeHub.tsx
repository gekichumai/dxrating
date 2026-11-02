import { plateName } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import { type FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SheetImage } from '@/components/sheet/SheetListItem'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { HOME_FEATURES, type HomeFeatureId, type HomeRecentSong } from './homeModules'
import { useHomeQuickStats } from './useHomeQuickStats'
import IconMdiTrophyOutline from '~icons/mdi/trophy-outline'
import IconMdiCardAccountDetailsStarOutline from '~icons/mdi/card-account-details-star-outline'
import IconMdiTable from '~icons/mdi/table'
import IconMdiChartBar from '~icons/mdi/chart-bar'
import IconMdiFormatListNumbered from '~icons/mdi/format-list-numbered'
import IconMdiTargetArrow from '~icons/mdi/target-arrow'
import IconMdiCalculatorVariantOutline from '~icons/mdi/calculator-variant-outline'
import IconMdiTrendingUp from '~icons/mdi/trending-up'
import IconMdiDiceMultipleOutline from '~icons/mdi/dice-multiple-outline'
import IconMdiNewBox from '~icons/mdi/new-box'
import IconMdiFire from '~icons/mdi/fire'
import IconMdiHistory from '~icons/mdi/history'

const FEATURE_ICONS: Record<HomeFeatureId, FC<{ className?: string }>> = {
  rating: IconMdiTrophyOutline,
  plates: IconMdiCardAccountDetailsStarOutline,
  constants: IconMdiTable,
  level_progress: IconMdiChartBar,
  toplists: IconMdiFormatListNumbered,
  recommend: IconMdiTrendingUp,
  tolerance: IconMdiTargetArrow,
  rating_tools: IconMdiCalculatorVariantOutline,
  random: IconMdiDiceMultipleOutline,
  recent: IconMdiNewBox,
  trending: IconMdiFire,
  versions: IconMdiHistory,
}

const trackClick = (module: string, target?: string) => captureAnalyticsEvent('home_module_clicked', { module, target })

const SectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="m-0 px-1 text-sm font-bold tracking-wide text-zinc-600 dark:text-zinc-300">{children}</h2>
)

const QuickStats: FC = () => {
  const { t, i18n } = useTranslation(['home'])
  const stats = useHomeQuickStats()
  if (!stats) return null
  const script = (i18n.resolvedLanguage ?? i18n.language).startsWith('zh-Hans') ? 'zh' : 'ja'
  // The B50 floor is the lowest entry across both buckets
  const floors = [stats.b15Floor, stats.b35Floor].filter((value): value is number => value !== null)
  const floor = floors.length > 0 ? Math.min(...floors) : null

  return (
    <section className="flex flex-col gap-2" aria-labelledby="home-quick-stats">
      <SectionTitle>
        <span id="home-quick-stats">{t('home:stats.title')}</span>
        {stats.isDemo && <span className="ml-2 text-xs font-normal opacity-70">{t('home:stats.demo')}</span>}
      </SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Link to="/rating" onClick={() => trackClick('quick_stats', 'rating')} className="no-underline text-inherit">
          <MaterialSurface className="flex h-full flex-col gap-0.5 px-3 py-2.5 transition hover:bg-white/70 dark:hover:bg-zinc-800/60">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('home:stats.rating')}</span>
            <span className="text-xl font-bold tabular-nums">{stats.rating}</span>
          </MaterialSurface>
        </Link>
        <Link to="/rating" onClick={() => trackClick('quick_stats', 'b50_floor')} className="no-underline text-inherit">
          <MaterialSurface className="flex h-full flex-col gap-0.5 px-3 py-2.5 transition hover:bg-white/70 dark:hover:bg-zinc-800/60">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('home:stats.b50-floor')}</span>
            <span className="text-xl font-bold tabular-nums">{floor ?? '—'}</span>
          </MaterialSurface>
        </Link>
        {stats.nearestPlate ? (
          <Link
            to={`/plates/${stats.nearestPlate.plate.id}` as never}
            onClick={() => trackClick('quick_stats', 'nearest_plate')}
            className="no-underline text-inherit"
          >
            <MaterialSurface className="flex h-full flex-col gap-0.5 px-3 py-2.5 transition hover:bg-white/70 dark:hover:bg-zinc-800/60">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('home:stats.nearest-plate')}</span>
              <span className="truncate text-xl font-bold">{plateName(stats.nearestPlate.plate, script)}</span>
              <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {stats.nearestPlate.completedSheets} / {stats.nearestPlate.totalSheets}
              </span>
            </MaterialSurface>
          </Link>
        ) : (
          <MaterialSurface className="flex h-full flex-col gap-0.5 px-3 py-2.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('home:stats.nearest-plate')}</span>
            <span className="text-xl font-bold">—</span>
          </MaterialSurface>
        )}
      </div>
    </section>
  )
}

export const HomeHub: FC<{ recentSongs: readonly HomeRecentSong[] }> = ({ recentSongs }) => {
  const { t } = useTranslation(['home', 'sheet'])
  // Scores live on the client only: the server and cached HTML stay user-agnostic
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="flex w-full flex-col gap-4" data-testid="home-hub">
      {mounted && <QuickStats />}

      {recentSongs.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="home-recent">
          <div className="flex items-baseline justify-between gap-2">
            <SectionTitle>
              <span id="home-recent">{t('home:recent.title')}</span>
            </SectionTitle>
            <Link
              to="/charts/recent"
              onClick={() => trackClick('recent', 'see_all')}
              className="px-1 text-xs font-bold text-blue-700 no-underline dark:text-blue-300"
            >
              {t('home:recent.see-all')}
            </Link>
          </div>
          <MaterialSurface className="overflow-x-auto">
            <ul className="m-0 flex list-none gap-3 p-3">
              {recentSongs.map((song) => (
                <li key={song.songId} className="w-20 shrink-0">
                  <Link
                    to="/songs/$songId"
                    params={{ songId: song.songId }}
                    onClick={() => trackClick('recent', song.songId)}
                    className="flex flex-col gap-1 text-inherit no-underline"
                  >
                    <SheetImage
                      name={song.imageName}
                      size="large"
                      alt={t('sheet:cover-art-alt', { title: song.title })}
                      className="h-20 w-20 rounded-lg overflow-hidden outline outline-1 -outline-offset-1 outline-black/10"
                    />
                    <span className="line-clamp-2 text-xs leading-tight">{song.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </MaterialSurface>
        </section>
      )}

      <nav className="flex flex-col gap-2" aria-labelledby="home-features">
        <SectionTitle>
          <span id="home-features">{t('home:features.title')}</span>
        </SectionTitle>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-4">
          {HOME_FEATURES.map((feature) => {
            const Icon = FEATURE_ICONS[feature.id]
            return (
              <li key={feature.id}>
                <Link
                  to={feature.to as never}
                  search={feature.search as never}
                  onClick={() => trackClick('feature', feature.id)}
                  className="block h-full text-inherit no-underline"
                >
                  <MaterialSurface className="flex h-full items-start gap-2.5 px-3 py-2.5 transition hover:bg-white/70 dark:hover:bg-zinc-800/60">
                    <Icon className="mt-0.5 shrink-0 text-lg text-blue-700 dark:text-blue-300" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-bold">{t(`home:features.${feature.id}.title`)}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {t(`home:features.${feature.id}.description`)}
                      </span>
                    </span>
                  </MaterialSurface>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
