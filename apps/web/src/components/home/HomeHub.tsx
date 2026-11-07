import { plateName } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import { type FC, useEffect, useId, useState } from 'react'
import clsx from 'clsx'
import { SheetImage } from '@/components/sheet/SheetListItem'
import { MaterialSurface } from '@/components/global/MaterialSurface'
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
import IconMdiChevronDown from '~icons/mdi/chevron-down'
import type { PlainMessage } from '@/i18n/message'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

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

const FEATURE_COPY = {
  rating: { title: m.home_features_rating_title, description: m.home_features_rating_description },
  plates: { title: m.home_features_plates_title, description: m.home_features_plates_description },
  constants: { title: m.home_features_constants_title, description: m.home_features_constants_description },
  level_progress: {
    title: m.home_features_level_progress_title,
    description: m.home_features_level_progress_description,
  },
  toplists: { title: m.home_features_toplists_title, description: m.home_features_toplists_description },
  recommend: { title: m.home_features_recommend_title, description: m.home_features_recommend_description },
  tolerance: { title: m.home_features_tolerance_title, description: m.home_features_tolerance_description },
  rating_tools: { title: m.home_features_rating_tools_title, description: m.home_features_rating_tools_description },
  random: { title: m.home_features_random_title, description: m.home_features_random_description },
  recent: { title: m.home_features_recent_title, description: m.home_features_recent_description },
  trending: { title: m.home_features_trending_title, description: m.home_features_trending_description },
  versions: { title: m.home_features_versions_title, description: m.home_features_versions_description },
} satisfies Record<HomeFeatureId, { title: PlainMessage; description: PlainMessage }>

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
  const locale = useLocale()
  const stats = useHomeQuickStats()
  if (!stats) return null
  const script = locale.startsWith('zh-Hans') ? 'zh' : 'ja'
  // The B50 floor is the lowest entry across both buckets
  const floors = [stats.b15Floor, stats.b35Floor].filter((value): value is number => value !== null)
  const floor = floors.length > 0 ? Math.min(...floors) : null

  return (
    <section className="flex flex-col gap-2" aria-labelledby="home-quick-stats">
      <div className="flex items-baseline gap-2">
        <SectionTitle id="home-quick-stats">{m.home_stats_title({}, { locale })}</SectionTitle>
        {stats.isDemo && <span className="text-xs text-fg-2">{m.home_stats_demo({}, { locale })}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Link to="/rating" onClick={() => trackClick('quick_stats', 'rating')} className={CARD_LINK}>
          <MaterialSurface className={`flex h-full flex-col gap-0.5 px-3 py-2.5 ${CARD_SURFACE}`}>
            <span className="text-xs text-fg-2">{m.home_stats_rating({}, { locale })}</span>
            <span className="text-xl font-semibold display-num">{stats.rating}</span>
          </MaterialSurface>
        </Link>
        <Link to="/rating" onClick={() => trackClick('quick_stats', 'b50_floor')} className={CARD_LINK}>
          <MaterialSurface className={`flex h-full flex-col gap-0.5 px-3 py-2.5 ${CARD_SURFACE}`}>
            <span className="text-xs text-fg-2">{m.home_stats_b50Floor({}, { locale })}</span>
            <span className="text-xl font-semibold display-num">{floor ?? '—'}</span>
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
              <span className="text-xs text-fg-2">{m.home_stats_nearestPlate({}, { locale })}</span>
              <span className="truncate text-xl font-semibold">{plateName(stats.nearestPlate.plate, script)}</span>
              <span className="text-xs num text-fg-2">
                {stats.nearestPlate.completedSheets} / {stats.nearestPlate.totalSheets}
              </span>
            </MaterialSurface>
          </Link>
        ) : (
          <MaterialSurface className="flex h-full flex-col gap-0.5 px-3 py-2.5">
            <span className="text-xs text-fg-2">{m.home_stats_nearestPlate({}, { locale })}</span>
            <span className="text-xl font-semibold">—</span>
          </MaterialSurface>
        )}
      </div>
    </section>
  )
}

export const HomeHub: FC<{ recentSongs: readonly HomeRecentSong[] }> = ({ recentSongs }) => {
  const locale = useLocale()
  // Scores live on the client only: the server and cached HTML stay user-agnostic
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Below sm the new charts start folded, so the search results sit higher on a phone; wider screens always show them
  const [recentExpanded, setRecentExpanded] = useState(false)
  const recentContentId = useId()
  const recentTitle = m.home_recent_title({}, { locale })

  return (
    <div className="flex w-full flex-col gap-4" data-testid="home-hub">
      {mounted && <QuickStats />}

      {recentSongs.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="home-recent">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle id="home-recent">
              {/* The heading holds a disclosure button below sm and plain text from sm. The hidden one is display:
                  none, so the heading's name is the title either way. CSS, not matchMedia, so SSR stays deterministic */}
              <button
                type="button"
                aria-expanded={recentExpanded}
                aria-controls={recentContentId}
                onClick={() => {
                  trackClick('recent', recentExpanded ? 'collapse' : 'expand')
                  setRecentExpanded((expanded) => !expanded)
                }}
                className="-mx-1 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border-0 bg-transparent px-1 text-inherit font-inherit sm:hidden"
              >
                {recentTitle}
                <IconMdiChevronDown
                  aria-hidden="true"
                  className={clsx(
                    'size-5 text-fg-2 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)] motion-reduce:transition-none',
                    recentExpanded && 'rotate-180',
                  )}
                />
              </button>
              <span className="hidden sm:inline">{recentTitle}</span>
            </SectionTitle>
            <Link
              to="/charts/recent"
              onClick={() => trackClick('recent', 'see_all')}
              className="inline-flex min-h-6 items-center rounded-[var(--radius-sm)] px-2 text-sm font-semibold text-accent-strong no-underline hover:underline"
            >
              {m.home_recent_seeAll({}, { locale })}
            </Link>
          </div>
          {/* Phones scroll one row of 8 covers; from lg the strip spans the hub as a one-row grid and shows more covers
              (10 at lg, 13 at xl, as many as fit a row). Hidden by CSS, not matchMedia, so SSR stays deterministic.
              Covers sit 12px in, so they keep their own radius. On phones the row snaps cover by cover, each stopping at
              that 12px inset, and fades at an edge that has more covers past it (scroll-fade-x). */}
          <MaterialSurface id={recentContentId} className={clsx('w-full', !recentExpanded && 'hidden sm:block')}>
            <div className="scroll-fade-x overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-3 lg:scroll-fade-x-none lg:overflow-visible lg:snap-none">
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
                        alt={m.sheet_coverArtAlt({ title: song.title }, { locale })}
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
        <SectionTitle id="home-features">{m.home_features_title({}, { locale })}</SectionTitle>
        {/*
          Every destination is on screen at every width: phones get a compact two-column grid of names (the hub is
          not rendered while there is a query, so its height never pushes search results down), wider screens add
          the descriptions and more columns.
        */}
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {HOME_FEATURES.map((feature) => {
            const Icon = FEATURE_ICONS[feature.id]
            return (
              <li key={feature.id}>
                <Link to={feature.to} onClick={() => trackClick('feature', feature.id)} className={CARD_LINK}>
                  <MaterialSurface
                    className={`flex h-full items-center gap-2 px-2.5 py-2 sm:items-start sm:gap-2.5 sm:px-3 sm:py-2.5 ${CARD_SURFACE}`}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-accent-strong" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold">{FEATURE_COPY[feature.id].title({}, { locale })}</span>
                      <span className="sr-only text-xs text-fg-2 text-pretty sm:not-sr-only">
                        {FEATURE_COPY[feature.id].description({}, { locale })}
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