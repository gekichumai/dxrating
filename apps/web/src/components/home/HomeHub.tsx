import { plateName } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import { type FC, useEffect, useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { SheetImage } from '@/components/sheet/SheetListItem'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { useHorizontalOverflow } from '@/components/completion/TableChrome'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { plateRegionSearch } from '@/components/plates/plateData'
import {
  HOME_FEATURES,
  HOME_RECENT_SONG_LIMIT_LG,
  HOME_RECENT_SONG_LIMIT_MOBILE,
  type HomeFeatureId,
  type HomeRecentSong,
} from './homeModules'
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

const FEATURE_ICONS: Record<HomeFeatureId, FC<{ className?: string; 'aria-hidden'?: 'true' }>> = {
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

const SectionTitle: FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <h2 id={id} className="section-title m-0 px-1">
    {children}
  </h2>
)

// Cards are whole links: the link carries the card's radius so the focus ring follows its corners
const CARD_LINK = 'block h-full rounded-[var(--radius-lg)] text-inherit no-underline'
const CARD_SURFACE = 'transition-[background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-white/70'

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
      <div className="flex items-baseline gap-2">
        <SectionTitle id="home-quick-stats">{t('home:stats.title')}</SectionTitle>
        {stats.isDemo && <span className="text-xs text-fg-2">{t('home:stats.demo')}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Link to="/rating" onClick={() => trackClick('quick_stats', 'rating')} className={CARD_LINK}>
          <MaterialSurface className={`flex h-full flex-col gap-0.5 px-3 py-2.5 ${CARD_SURFACE}`}>
            <span className="text-xs text-fg-2">{t('home:stats.rating')}</span>
            <span className="text-xl font-semibold tabular-nums">{stats.rating}</span>
          </MaterialSurface>
        </Link>
        <Link to="/rating" onClick={() => trackClick('quick_stats', 'b50_floor')} className={CARD_LINK}>
          <MaterialSurface className={`flex h-full flex-col gap-0.5 px-3 py-2.5 ${CARD_SURFACE}`}>
            <span className="text-xs text-fg-2">{t('home:stats.b50-floor')}</span>
            <span className="text-xl font-semibold tabular-nums">{floor ?? '—'}</span>
          </MaterialSurface>
        </Link>
        {stats.nearestPlate ? (
          <Link
            to="/plates/$plate"
            params={{ plate: stats.nearestPlate.plate.id }}
            search={plateRegionSearch(stats.nearestPlate.region)}
            onClick={() => trackClick('quick_stats', 'nearest_plate')}
            className={CARD_LINK}
          >
            <MaterialSurface className={`flex h-full flex-col gap-0.5 px-3 py-2.5 ${CARD_SURFACE}`}>
              <span className="text-xs text-fg-2">{t('home:stats.nearest-plate')}</span>
              <span className="truncate text-xl font-semibold">{plateName(stats.nearestPlate.plate, script)}</span>
              <span className="text-xs tabular-nums text-fg-2">
                {stats.nearestPlate.completedSheets} / {stats.nearestPlate.totalSheets}
              </span>
            </MaterialSurface>
          </Link>
        ) : (
          <MaterialSurface className="flex h-full flex-col gap-0.5 px-3 py-2.5">
            <span className="text-xs text-fg-2">{t('home:stats.nearest-plate')}</span>
            <span className="text-xl font-semibold">—</span>
          </MaterialSurface>
        )}
      </div>
    </section>
  )
}

export const HomeHub: FC<{ recentSongs: readonly HomeRecentSong[] }> = ({ recentSongs }) => {
  const { t } = useTranslation(['home', 'sheet'])
  const recentScroller = useHorizontalOverflow<HTMLDivElement>()
  // Scores live on the client only: the server and cached HTML stay user-agnostic
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="flex w-full flex-col gap-4" data-testid="home-hub">
      {mounted && <QuickStats />}

      {recentSongs.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="home-recent">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle id="home-recent">{t('home:recent.title')}</SectionTitle>
            <Link
              to="/charts/recent"
              onClick={() => trackClick('recent', 'see_all')}
              className="inline-flex min-h-6 items-center rounded-[var(--radius-sm)] px-2 text-sm font-semibold text-accent-strong no-underline hover:underline"
            >
              {t('home:recent.see-all')}
            </Link>
          </div>
          {/* Phones scroll one row of 8 covers; from lg the strip spans the hub as a one-row grid and shows more covers
              (10 at lg, 13 at xl, as many as fit a row). Hidden by CSS, not matchMedia, so SSR stays deterministic.
              Covers sit 12px in, so they keep their own radius. On phones the row snaps cover by cover, each stopping at
              that 12px inset, and fades at an edge that has more covers past it. */}
          <MaterialSurface className="w-full">
            <div
              ref={recentScroller.ref}
              className={clsx(
                'overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-3 lg:overflow-visible lg:snap-none',
                recentScroller.fade,
              )}
            >
              <ul className="m-0 flex list-none gap-3 p-3 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(5rem,1fr))]">
                {recentSongs.map((song, index) => (
                  <li
                    key={song.songId}
                    className={clsx(
                      'w-20 shrink-0 snap-start',
                      index >= HOME_RECENT_SONG_LIMIT_LG
                        ? 'hidden xl:block'
                        : index >= HOME_RECENT_SONG_LIMIT_MOBILE && 'hidden lg:block',
                    )}
                  >
                    <Link
                      to="/songs/$songId"
                      params={{ songId: song.songId }}
                      onClick={() => trackClick('recent', song.songId)}
                      className="flex flex-col gap-1 rounded-[var(--radius-md)] text-inherit no-underline"
                    >
                      <SheetImage
                        name={song.imageName}
                        size="large"
                        alt={t('sheet:cover-art-alt', { title: song.title })}
                        className="h-20 w-20 rounded-[var(--radius-md)] overflow-hidden outline outline-1 -outline-offset-1 outline-black/10"
                      />
                      <span className="line-clamp-2 text-xs leading-snug [word-break:auto-phrase]">{song.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </MaterialSurface>
        </section>
      )}

      <nav className="flex flex-col gap-2" aria-labelledby="home-features">
        <SectionTitle id="home-features">{t('home:features.title')}</SectionTitle>
        {/*
          On phones two scrolling rows keep the search results near the top; wider screens get the full grid. The phone
          scroller bleeds to the screen edges (-mx-4 against the page's 16px gutter) and snaps with a 16px scroll padding,
          so a resting card lines up with the section title and the next column runs off the screen edge, not sliced
          at the gutter. A scroller clips on both axes, so 4px of vertical padding (offset by a negative margin) holds
          the cards' border, shadow and 3px focus outline.
        */}
        <ul className="-mx-4 -my-1 grid list-none grid-flow-col grid-rows-2 auto-cols-[minmax(10.5rem,46%)] gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-4 px-4 py-1 pb-2 sm:m-0 sm:grid-flow-row sm:grid-rows-none sm:auto-cols-auto sm:grid-cols-3 sm:overflow-visible sm:p-0 lg:grid-cols-4 xl:grid-cols-6">
          {HOME_FEATURES.map((feature) => {
            const Icon = FEATURE_ICONS[feature.id]
            return (
              <li key={feature.id} className="snap-start">
                <Link to={feature.to} onClick={() => trackClick('feature', feature.id)} className={CARD_LINK}>
                  <MaterialSurface className={`flex h-full items-start gap-2.5 px-3 py-2.5 ${CARD_SURFACE}`}>
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-accent-strong" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold">{t(`home:features.${feature.id}.title`)}</span>
                      <span className="text-xs text-fg-2 text-pretty">
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