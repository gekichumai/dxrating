import { coverUrl } from '@gekichumai/dxdata'
import clsx from 'clsx'
import { type FC, memo, useCallback } from 'react'
import { type GridComputeItemKey, type GridItemContent, VirtuosoGrid } from 'react-virtuoso'
import { useWebHaptics } from 'web-haptics/react'
import MdiLock from '~icons/mdi/lock'
import MdiStar from '~icons/mdi/star'
import MdiTrashCan from '~icons/mdi/trash-can'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { DIFFICULTIES } from '../../models/difficulties'
import { useSheetFavoriteState } from '../../models/favorite'
import type { FlattenedSheet } from '../../songs'
import { DIFFICULTY_SHORT, difficultyTextClassName, difficultyTextStyle } from '../completion/TableChrome'
import { FadedImage } from '../global/FadedImage'
import { InternalLink, isPlainNavigationClick } from '../global/InternalLink'
import { MaterialSurface } from '../global/MaterialSurface'
import { SHEET_LIST_FIRST_SCREEN_ROWS } from './SheetListContainer'
import { captureSheetContentViewed, type SheetListItemAnalyticsProps, SheetType } from './SheetListItem'
import { buildSheetPath } from './sheetLinks'

/**
 * Three columns on phones, like the iOS app's results grid; from `sm` as many 8.5rem columns as fit. Every tile has the
 * same height (a square jacket, two title lines, one 24px line for the difficulty), which the virtualised grid needs.
 */
const SHEET_GRID_COLUMNS =
  'grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:gap-x-3 sm:gap-y-4'
// 4px of padding on phones gives the 8px tiles' focus rings room inside the 12px surface
const SHEET_GRID_SURFACE = 'w-full p-2 sm:p-3'

/** The fill under a Utage chart's level, the in-game Utage magenta (white text passes 4.5:1); as in the iOS app */
const UTAGE_LEVEL_FILL = '#CC1F7A'

const TILE_PILL =
  'inline-flex h-5 items-center gap-0.5 rounded-[var(--radius-sm)] px-1 text-xs sm:gap-1 sm:px-1.5 font-bold leading-none text-white num shadow-[0_1px_0_0_rgb(0_0_0/0.15)]'

/**
 * The difficulty as a short pill (MAS, Re:M): a tile is too narrow for the full name beside the chart constant. A
 * Utage chart has no constant, so its pill carries the level instead. Below sm the pill is 6px tighter, so a locked
 * Re:MAS still fits beside a 14.9 in a 360px phone's three-column tile.
 */
const SheetGridDifficulty: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const locale = useLocale()

  if (sheet.isTypeUtage) {
    return (
      <span className={TILE_PILL} style={{ backgroundColor: UTAGE_LEVEL_FILL }}>
        {sheet.level}
      </span>
    )
  }

  const config = DIFFICULTIES[sheet.difficulty]
  if (!config) return null
  const unavailable = (sheet.serverIds ?? []).length === 0

  return (
    <span className={TILE_PILL} style={{ backgroundColor: config.solid }}>
      {unavailable && (
        <>
          <MdiTrashCan aria-hidden="true" className="size-3 shrink-0" />
          <span className="sr-only">{m.sheet_badge_unavailable({}, { locale })}</span>
        </>
      )}
      {sheet.isLocked && (
        <>
          <MdiLock aria-hidden="true" className="size-3 shrink-0" />
          <span className="sr-only">{m.sheet_badge_locked({}, { locale })}</span>
        </>
      )}
      <span aria-hidden="true">{DIFFICULTY_SHORT[sheet.difficulty]}</span>
      <span className="sr-only">{config.title}</span>
    </span>
  )
}

/**
 * A chart in the grid: the jacket with its chart type (and a star when it is a favourite), the title, then the
 * difficulty on the left and the chart constant, in the difficulty's colour, on the right. Opens the chart dialog like
 * a list row; the href is the chart's own page for new tabs and crawlers.
 */
export const SheetGridItem: FC<{
  sheet: FlattenedSheet
  dialogOpen: boolean
  onOpen: () => void
  analytics?: SheetListItemAnalyticsProps
}> = memo(({ sheet, dialogOpen, onOpen, analytics }) => {
  const locale = useLocale()
  const haptic = useWebHaptics()
  const [isFavorite] = useSheetFavoriteState(sheet.id)

  return (
    <InternalLink
      href={buildSheetPath(sheet)}
      onClick={(event) => {
        if (!isPlainNavigationClick(event)) return
        event.preventDefault()
        onOpen()
        haptic.trigger('medium')
        captureSheetContentViewed(sheet, analytics)
      }}
      className="group flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-md)] text-fg-1 no-underline"
    >
      <span
        className={clsx(
          'relative block aspect-square overflow-hidden rounded-[var(--radius-md)] bg-black/6 outline',
          'transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0',
          // The open chart's tile keeps an accent ring while its dialog is up, as its list row keeps a tint
          dialogOpen
            ? 'outline-2 outline-offset-2 outline-accent-strong'
            : 'outline-1 -outline-offset-1 outline-black/10',
        )}
      >
        <FadedImage
          src={coverUrl(sheet.songId)}
          alt=""
          width={190}
          height={190}
          loading="lazy"
          decoding="async"
          className="size-full"
          placeholderClassName="bg-black/6"
        />
        <span className="absolute left-1.5 top-1.5 flex drop-shadow-[0_1px_1px_rgb(0_0_0/0.35)]">
          <SheetType type={sheet.type} difficulty={sheet.difficulty} compact />
        </span>
        {isFavorite && (
          <>
            <MdiStar
              aria-hidden="true"
              className="absolute right-1 top-1 size-5 text-amber-400 drop-shadow-[0_1px_1px_rgb(0_0_0/0.5)]"
            />
            <span className="sr-only">{m.sheet_favorite_marked({}, { locale })}</span>
          </>
        )}
      </span>

      {/* Always two lines tall, so every tile in a row is the same height */}
      <span
        lang="ja"
        className="line-clamp-2 h-[2.5em] text-sm font-semibold leading-tight [overflow-wrap:anywhere] [word-break:auto-phrase] underline-offset-2 group-hover:underline"
      >
        {sheet.title}
      </span>

      <span className="flex h-6 min-w-0 items-center justify-between gap-1">
        <SheetGridDifficulty sheet={sheet} />
        {!sheet.isTypeUtage && (
          <span
            className={clsx('text-base font-semibold leading-none num', difficultyTextClassName)}
            style={difficultyTextStyle(sheet.difficulty)}
          >
            {sheet.internalLevelValue.toFixed(1)}
          </span>
        )}
      </span>
    </InternalLink>
  )
})
SheetGridItem.displayName = 'SheetGridItem'

const computeSheetKey: GridComputeItemKey<FlattenedSheet, unknown> = (_index, sheet) => sheet.id

/** The grid counterpart of SheetListContainer, for the home page's grid layout */
export const SheetGridContainer: FC<{
  sheets: FlattenedSheet[]
  activeSheetId: string | null
  onSheetDialogChange: (sheet: FlattenedSheet | null) => void
  analyticsSource?: SheetListItemAnalyticsProps['source']
  analyticsQueryPresent?: boolean
  analyticsResultCount?: number
}> = ({ sheets, activeSheetId, onSheetDialogChange, analyticsSource, analyticsQueryPresent, analyticsResultCount }) => {
  const ItemContent = useCallback<GridItemContent<FlattenedSheet, unknown>>(
    (index, sheet) => {
      if (!sheet) return null
      const analytics = analyticsSource
        ? {
            source: analyticsSource,
            position: index + 1,
            queryPresent: analyticsQueryPresent,
            resultCount: analyticsResultCount,
          }
        : undefined
      return (
        <SheetGridItem
          sheet={sheet}
          dialogOpen={sheet.id === activeSheetId}
          onOpen={() => onSheetDialogChange(sheet)}
          analytics={analytics}
        />
      )
    },
    [activeSheetId, analyticsQueryPresent, analyticsResultCount, analyticsSource, onSheetDialogChange],
  )

  return (
    // As in SheetListContainer, the outer box keeps the page height steady while results change
    <div className="w-full min-h-[100lvh]">
      {sheets.length > 0 && (
        <MaterialSurface className={SHEET_GRID_SURFACE}>
          <VirtuosoGrid
            useWindowScroll
            data={sheets}
            itemContent={ItemContent}
            computeItemKey={computeSheetKey}
            listClassName={SHEET_GRID_COLUMNS}
            itemClassName="min-w-0"
            increaseViewportBy={500}
            initialItemCount={Math.min(sheets.length, SHEET_LIST_FIRST_SCREEN_ROWS)}
          />
        </MaterialSurface>
      )}
    </div>
  )
}

const skeletonTiles = Array.from({ length: 12 }, (_, index) => index)

/** Placeholder tiles while the catalog loads, in the grid's own columns */
export const SheetGridSkeleton: FC = () => (
  <MaterialSurface className={SHEET_GRID_SURFACE} aria-hidden="true">
    <div className={SHEET_GRID_COLUMNS}>
      {skeletonTiles.map((index) => (
        <div key={index} className="flex animate-pulse flex-col gap-1.5" style={{ animationDelay: `${index * 40}ms` }}>
          <div className="aspect-square rounded-[var(--radius-md)] bg-black/8" />
          <div className="h-[2.5em] text-sm">
            <div className="h-4 w-4/5 rounded-[var(--radius-xs)] bg-black/8" />
          </div>
          <div className="flex h-6 items-center justify-between">
            <div className="h-5 w-9 rounded-[var(--radius-sm)] bg-black/8" />
            <div className="h-4 w-8 rounded-[var(--radius-xs)] bg-black/5" />
          </div>
        </div>
      ))}
    </div>
  </MaterialSurface>
)