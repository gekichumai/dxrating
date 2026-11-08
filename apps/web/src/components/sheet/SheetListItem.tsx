import { type DifficultyEnum, type ServerEnum, TypeEnum } from '@gekichumai/dxdata'
import { IconButton, ListItemButton, ListItemText, type ListItemTextProps } from '@mui/material'
import clsx from 'clsx'
import {
  type ElementType,
  type FC,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  memo,
  type ReactNode,
  useState,
} from 'react'
import { useWebHaptics } from 'web-haptics/react'
import toast from 'react-hot-toast'
import { match } from 'ts-pattern'
import MdiComment from '~icons/mdi/comment'
import MdiContentCopy from '~icons/mdi/content-copy'
import MdiLock from '~icons/mdi/lock'
import MdiTrashCan from '~icons/mdi/trash-can'
import { DIFFICULTIES, DIFFICULTY_SHORT_TITLES } from '../../models/difficulties'
import { FixedWidthText } from '../global/FixedWidthText'
import { captureAnalyticsEvent, type SheetViewSource } from '../../lib/analytics'
import type { FlattenedSheet } from '../../songs'
import { FadedImage } from '../global/FadedImage'
import { ResponsiveDialog } from '../global/ResponsiveDialog'
import { AddSheetAltNameButton } from './AddSheetAltNameButton'
import { SheetAltNames } from './SheetAltNames'
import { SheetDialogContent, type SheetDialogContentProps } from './SheetDialogContent'
import { buildSheetPath } from './sheetLinks'
import { SHEET_TABLE_ROW_COLUMNS, SheetRowLayoutContext, useSheetRowLayout } from './sheetRowLayout'
import { getSheetTypeAltText, SHEET_TYPE_IMAGES, SHEET_TYPE_UTAGE_2P_END_ADORNMENT_IMAGE } from './sheetTypeAssets'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { isPlainNavigationClick, LinkBehavior } from '@/components/global/InternalLink'

export interface SheetListItemAnalyticsProps {
  source: SheetViewSource
  position?: number
  queryPresent?: boolean
  resultCount?: number
}

/** Records that a chart was opened from a list row or a grid tile */
export const captureSheetContentViewed = (sheet: FlattenedSheet, analytics?: SheetListItemAnalyticsProps) =>
  captureAnalyticsEvent('sheet_content_viewed', {
    song_id: sheet.songId,
    sheet_type: sheet.type,
    sheet_difficulty: sheet.difficulty,
    source: analytics?.source ?? 'unknown',
    position: analytics?.position,
    query_present: analytics?.queryPresent,
    result_count: analytics?.resultCount,
    sheet_version: sheet.version,
    internal_level: sheet.internalLevelValue,
    is_rating_eligible: sheet.isRatingEligible,
  })

export const SheetListItem: FC<{
  size?: 'small' | 'medium'
  className?: string
  /** The row's horizontal padding; it overrides MUI's own, so each class needs `!` */
  insetClassName?: string
  /** Shown before the row's content, such as a rank number */
  startAdornment?: ReactNode
  children?: ReactNode
  sheet: FlattenedSheet
  dialogOpen?: boolean
  onDialogOpenChange?: (open: boolean) => void

  SheetListItemContentProps?: Omit<SheetListItemContentProps, 'sheet'>
  SheetDialogContentProps?: Omit<SheetDialogContentProps, 'sheet'>
  analytics?: SheetListItemAnalyticsProps
}> = memo(
  ({
    size = 'medium',
    className,
    insetClassName = '!px-4',
    startAdornment,
    children,
    sheet,
    dialogOpen,
    onDialogOpenChange,
    SheetListItemContentProps,
    SheetDialogContentProps,
    analytics,
  }) => {
    const haptic = useWebHaptics()
    const isTable = useSheetRowLayout() === 'table'
    const [internalOpen, setInternalOpen] = useState(false)

    const isControlled = dialogOpen !== undefined
    const open = isControlled ? dialogOpen : internalOpen
    const setOpen = isControlled ? (v: boolean) => onDialogOpenChange?.(v) : setInternalOpen

    return (
      <>
        {!isControlled && (
          // The dialog is a narrow surface: its rows stay stacked even when this list lays its rows out as a table
          <SheetRowLayoutContext.Provider value="stacked">
            <ResponsiveDialog open={open} setOpen={setOpen} hideCloseButton>
              {() => <SheetDialogContent sheet={sheet} onClose={() => setOpen(false)} {...SheetDialogContentProps} />}
            </ResponsiveDialog>
          </SheetRowLayoutContext.Provider>
        )}

        <ListItemButton
          component={LinkBehavior}
          href={buildSheetPath(sheet)}
          onClick={(e) => {
            if (!isPlainNavigationClick(e)) return
            e.preventDefault()
            setOpen(true)
            haptic.trigger('medium')
            captureSheetContentViewed(sheet, analytics)
          }}
          // Horizontal padding comes from CSS classes (!px-4 unless the list passes its own inset). Gutters must not depend
          // on the viewport in JS (a window-width hook renders "mobile" on the server and changed the class during
          // hydration on wide screens), so the secondary action's offset that disableGutters used to set (0 on phones,
          // 16px from md) is CSS instead. A table row sets its own 56px height, so it drops MUI's vertical padding
          className={clsx(
            'w-full cursor-pointer transition-colors duration-150 hover:duration-25 no-underline text-inherit',
            insetClassName,
            isTable && 'lg:!py-0',
            '[&_.MuiListItemSecondaryAction-root]:right-0 md:[&_.MuiListItemSecondaryAction-root]:right-4',
            open && '!bg-accent-subtle',
            className,
          )}
          // --radius-md rows inside a list surface with a 4px inset: 8 + 4 = the surface's 12
          sx={{ borderRadius: 'var(--radius-md)' }}
        >
          {startAdornment}
          {children ?? <SheetListItemContent sheet={sheet} size={size} {...SheetListItemContentProps} />}
        </ListItemButton>
      </>
    )
  },
)
SheetListItem.displayName = 'SheetListItem'

export interface SheetListItemContentProps extends HTMLAttributes<HTMLDivElement> {
  sheet: FlattenedSheet

  size?: 'small' | 'medium'
  enableSheetImage?: boolean
  SheetTitleProps?: Omit<SheetTitleProps, 'sheet'>
  ListItemTextProps?: ListItemTextProps
}

export interface SheetListItemContentViewProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode

  level: string
  internalLevelValue: number
  isTypeUtage?: boolean
  size?: 'small' | 'medium'
  enableSheetImage?: boolean
  imageName?: string
  imageAlt?: string
  ListItemTextProps?: ListItemTextProps
}

export const SheetListItemContentView: FC<SheetListItemContentViewProps> = memo(
  ({
    children,
    level,
    internalLevelValue,
    isTypeUtage,
    size = 'medium',
    className,
    enableSheetImage = true,
    imageName,
    imageAlt,
    ListItemTextProps,
    ...rest
  }) => {
    const isTable = useSheetRowLayout() === 'table'

    return (
      <div
        className={clsx(
          'flex items-center w-full p-1 gap-2 num relative',
          // From lg a table row is one 56px line of columns. ListItemText and the summary dissolve (display: contents),
          // so the title, artist, version and badges become the grid's cells
          isTable && [SHEET_TABLE_ROW_COLUMNS, 'lg:h-14 lg:py-0'],
          className,
        )}
        {...rest}
      >
        {enableSheetImage && imageName && imageAlt && (
          <SheetImage
            name={imageName}
            size={size}
            alt={imageAlt}
            className={clsx(isTable && 'lg:col-start-1 lg:row-start-1 lg:!h-10 lg:!w-10 lg:!min-h-10 lg:!min-w-10')}
          />
        )}

        <ListItemText
          {...ListItemTextProps}
          className={clsx(
            'ml-2 min-w-0',
            isTable && 'lg:contents lg:[&>.MuiListItemText-primary]:contents',
            ListItemTextProps?.className,
          )}
        >
          {children}
        </ListItemText>

        {/* A flex child rather than an absolutely positioned action, so long titles and badges can never run under it */}
        <div
          className={clsx(
            'ml-auto shrink-0 pl-2',
            isTable && 'lg:col-start-6 lg:row-start-1 lg:ml-0 lg:pl-0 lg:justify-self-end',
          )}
        >
          {isTypeUtage ? (
            <span className="font-semibold num text-lg text-fg-2">{level}</span>
          ) : (
            <SheetInternalLevelValue value={internalLevelValue} />
          )}
        </div>
      </div>
    )
  },
)
SheetListItemContentView.displayName = 'SheetListItemContentView'

export const SheetListItemContent: FC<SheetListItemContentProps> = memo(
  ({ sheet, size = 'medium', className, enableSheetImage = true, SheetTitleProps, ListItemTextProps, ...rest }) => {
    const locale = useLocale()
    const isTable = useSheetRowLayout() === 'table'

    return (
      <SheetListItemContentView
        level={sheet.level}
        internalLevelValue={sheet.internalLevelValue}
        isTypeUtage={sheet.isTypeUtage}
        size={size}
        className={className}
        enableSheetImage={enableSheetImage}
        imageName={sheet.imageName}
        imageAlt={m.sheet_coverArtAlt({ title: sheet.title }, { locale })}
        ListItemTextProps={ListItemTextProps}
        {...rest}
      >
        {isTable ? (
          // The same lines as SheetTitle below lg; the artist only joins in, as its own column, from lg
          <SheetListItemSummary
            title={sheet.title}
            type={sheet.type}
            difficulty={sheet.difficulty}
            version={sheet.version}
            serverIds={sheet.serverIds}
            isLocked={sheet.isLocked}
            artist={sheet.artist}
            artistProps={{ className: 'hidden lg:block' }}
            metadata={sheet.isTypeUtage ? <SheetUtageComment comment={sheet.comment} truncateOnTable /> : undefined}
            titleProps={{ className: clsx(size === 'small' && '!text-sm') }}
          />
        ) : (
          <SheetTitle
            {...SheetTitleProps}
            sheet={sheet}
            className={clsx('font-semibold', size === 'small' ? 'text-sm' : 'text-lg', SheetTitleProps?.className)}
          />
        )}
      </SheetListItemContentView>
    )
  },
)
SheetListItemContent.displayName = 'SheetListItemContent'

const SheetInternalLevelValue: FC<{ value: number }> = ({ value }) => {
  const wholePart = Math.floor(value)
  const decimalPart = value - wholePart

  return (
    <div className="font-semibold num">
      <span className="text-lg text-fg-2">{wholePart}.</span>
      <span className="text-xl text-fg-1">{decimalPart.toFixed(1).split('.')[1]}</span>
    </div>
  )
}

/**
 * The difficulty on its solid colour, one width in every row: the lock or trash icon slot plus the longest short name
 * (BAS … Re:MAS). A row without an icon centres its name across the whole pill, so locked, unavailable and playable
 * charts all line up. The full name is in the title and read to screen readers.
 */
export const SheetDifficulty: FC<{
  difficulty?: DifficultyEnum
  serverIds?: readonly ServerEnum[]
  isLocked?: boolean
}> = ({ difficulty, serverIds, isLocked }) => {
  const locale = useLocale()
  const difficultyConfig = difficulty ? DIFFICULTIES[difficulty] : undefined
  const allUnavailable = (serverIds ?? []).length === 0
  if (!difficultyConfig) return null
  const Icon = allUnavailable ? MdiTrashCan : isLocked ? MdiLock : null
  // The `solid` role carries white text at 4.5:1 or more; the brand colour itself only passes for MASTER
  return (
    <span
      className="inline-grid shrink-0 grid-cols-[1rem_auto] items-center gap-x-1 rounded-[var(--radius-sm)] px-1.5 text-sm font-semibold shadow-[0_1px_0_0_rgb(0_0_0/0.15)] leading-relaxed text-white"
      style={{ backgroundColor: difficultyConfig.solid }}
      title={difficultyConfig.title}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className="col-start-1 row-start-1 h-4 w-4 p-0.5 bg-[#fff] rounded-full"
          style={{ color: difficultyConfig.solid }}
        />
      )}
      {/* Sizes the name column in every row; it is the visible name only next to an icon */}
      <FixedWidthText
        text={difficultyConfig.shortTitle}
        sizers={DIFFICULTY_SHORT_TITLES}
        hidden={!Icon}
        className="col-start-2 row-start-1 justify-items-center"
        aria-hidden
      />
      {!Icon && (
        <span aria-hidden className="col-span-2 col-start-1 row-start-1 text-center">
          {difficultyConfig.shortTitle}
        </span>
      )}
      <span className="sr-only">
        {difficultyConfig.title}
        {allUnavailable && ` ${m.sheet_badge_unavailable({}, { locale })}`}
        {isLocked && ` ${m.sheet_badge_locked({}, { locale })}`}
      </span>
    </span>
  )
}

/**
 * The chart-type badge, with the in-game artwork. `compact` is the size for a grid tile's jacket: 18px tall, and 14px
 * for a Utage 2P chart, whose two-part artwork would otherwise be wider than a phone's three-column tile.
 */
export const SheetType: FC<{ type: TypeEnum; difficulty: DifficultyEnum; compact?: boolean }> = ({
  type,
  difficulty,
  compact = false,
}) => {
  const locale = useLocale()
  const isUtage = type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P
  const altText = getSheetTypeAltText(type, locale)

  if (isUtage) {
    const isUtage2P = type === TypeEnum.UTAGE2P
    // The artwork is 95.875 × 26 and the 2P end overlaps it by 27px; the compact sizes keep those proportions
    const artworkSize = !compact ? 'h-26px w-95.875px' : isUtage2P ? 'h-[14px] w-[51.6px]' : 'h-[18px] w-[66.4px]'

    return (
      <div className="inline-flex items-center">
        <div className={clsx('relative flex items-center justify-center text-center select-none', artworkSize)}>
          <img
            src={SHEET_TYPE_IMAGES[TypeEnum.UTAGE]}
            alt={altText}
            className="absolute inset-0 h-full w-full object-contain touch-callout-none"
            draggable={false}
          />
          <span
            aria-hidden="true"
            className={clsx(
              'relative text-shadow-[0_0_0.5rem_#FFFFFF99] text-white',
              !compact ? 'text-xs' : isUtage2P ? 'text-[0.5rem] leading-none' : 'text-[0.5625rem] leading-none',
            )}
          >
            {difficulty.replace(/[【】]/g, '')}
          </span>
        </div>
        {isUtage2P && (
          <img
            src={SHEET_TYPE_UTAGE_2P_END_ADORNMENT_IMAGE}
            className={clsx(
              'touch-callout-none',
              compact ? 'h-[14px] w-[51.6px] ml-[-14.5px]' : 'h-26px w-95.875px ml-[-27px]',
            )}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        )}
      </div>
    )
  }

  return (
    <img
      key={type}
      src={SHEET_TYPE_IMAGES[type]}
      className={clsx('touch-callout-none', compact ? 'h-[18px] w-[48.5px]' : 'h-26px w-70px')}
      alt={altText}
      draggable={false}
    />
  )
}

/** A Utage chart's comment. In a table row it stays on one line (full text on hover) so the row keeps its height */
const SheetUtageComment: FC<{ comment?: string; truncateOnTable?: boolean }> = ({ comment, truncateOnTable }) => (
  <span
    className={clsx(
      'text-sm text-zinc-600 dark:text-[#3f3f46] px-1.5 py-0.5 gap-1 bg-amber/75 inline-flex self-start rounded-md',
      truncateOnTable && 'lg:max-w-full',
    )}
    title={truncateOnTable ? comment : undefined}
  >
    <MdiComment aria-hidden="true" className="h-3 w-3 flex-shrink-0 mt-1.125" />
    <span className={clsx(truncateOnTable && 'lg:truncate lg:min-w-0')}>{comment}</span>
  </span>
)

/*
 * The title line of a sheet. On phones the badges sit under the title. From md they follow it on the same line, and
 * the title's line box matches the badges' 26px height, so the title's first line, the type image and the difficulty
 * pill share one centre. A title too long to leave them room pushes the whole badge row onto the next line,
 * left-aligned under it, instead of squeezing the badges into a stack at the far right.
 */
const SHEET_HEADING_CLASS = 'flex flex-col md:flex-row md:flex-wrap md:items-start gap-x-2 gap-y-1'
const SHEET_TITLE_TEXT_CLASS =
  'leading-tight md:leading-[26px] [text-wrap:pretty] [word-break:auto-phrase] [overflow-wrap:anywhere]'
const SHEET_BADGES_CLASS = 'flex flex-wrap md:flex-nowrap md:shrink-0 items-center gap-x-2 gap-y-1 min-w-0'

export interface SheetListItemSummaryProps {
  title: string
  type: TypeEnum
  difficulty: DifficultyEnum
  version?: string
  serverIds?: readonly ServerEnum[]
  isLocked?: boolean
  artist?: ReactNode
  metadata?: ReactNode
  titleElement?: 'h2' | 'h3'
  titleProps?: HTMLAttributes<HTMLHeadingElement>
  titleTextProps?: HTMLAttributes<HTMLSpanElement>
  artistProps?: HTMLAttributes<HTMLParagraphElement>
  className?: string
}

export const SheetListItemSummary: FC<SheetListItemSummaryProps> = memo(
  ({
    title,
    type,
    difficulty,
    version,
    serverIds,
    isLocked,
    artist,
    metadata,
    titleElement: TitleElement = 'h3',
    titleProps,
    titleTextProps,
    artistProps,
    className,
  }) => {
    const isTable = useSheetRowLayout() === 'table'

    return (
      <div className={clsx('flex flex-col', isTable && 'lg:contents', className)}>
        <TitleElement
          {...titleProps}
          className={clsx(
            SHEET_HEADING_CLASS,
            'font-semibold text-lg',
            // In a table row the heading dissolves, so its title and its badges become separate cells
            isTable && 'lg:contents',
            titleProps?.className,
          )}
        >
          <span className={clsx('flex flex-col min-w-0', isTable && 'lg:col-start-2 lg:row-start-1')}>
            <span
              {...titleTextProps}
              // A table row clamps the title to two lines, so the full title shows on hover
              title={isTable ? title : titleTextProps?.title}
              className={clsx(
                SHEET_TITLE_TEXT_CLASS,
                isTable && 'lg:line-clamp-2 lg:text-base lg:!leading-tight',
                titleTextProps?.className,
              )}
            >
              {title}
            </span>
          </span>
          <div className={clsx(SHEET_BADGES_CLASS, isTable && 'lg:col-start-5 lg:row-start-1')}>
            <SheetType type={type} difficulty={difficulty} />
            <SheetDifficulty difficulty={difficulty} serverIds={serverIds} isLocked={isLocked} />
          </div>
        </TitleElement>

        {artist && (
          <p
            {...artistProps}
            className={clsx(
              'text-sm text-fg-2 truncate',
              isTable && 'lg:col-start-3 lg:row-start-1 lg:m-0',
              artistProps?.className,
            )}
          >
            {artist}
          </p>
        )}

        {(version || metadata) && (
          // One cell for the version and any extra lines, so a table row keeps a single column for them
          <div className={clsx('flex flex-col min-w-0', isTable && 'lg:col-start-4 lg:row-start-1')}>
            {version && (
              <div className={clsx('text-sm', isTable && 'lg:truncate')}>
                <span className="text-fg-2">ver. {version}</span>
              </div>
            )}

            {metadata}
          </div>
        )}
      </div>
    )
  },
)
SheetListItemSummary.displayName = 'SheetListItemSummary'

/** A song's cover art by its image name */
export const sheetCoverSrc = (imageName: string) => `https://shama.dxrating.net/images/cover/v2/${imageName}.jpg`

export const SheetImage: FC<
  Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> & {
    name: string
    size?: 'small' | 'medium' | 'large'
    alt: string
  }
> = memo(
  ({ name, size = 'medium', alt, className, ...props }) => {
    return (
      <FadedImage
        key={name}
        src={sheetCoverSrc(name)}
        className={clsx(
          'overflow-hidden outline outline-1 -outline-offset-1 outline-black/10',
          match(size)
            .with('small', () => 'h-8 w-8 min-w-[2rem] min-h-[2rem] rounded-[var(--radius-xs)]')
            .with('medium', () => 'h-12 w-12 min-w-[3rem] min-h-[3rem] rounded-[var(--radius-xs)]')
            .with('large', () => 'h-16 w-16 min-w-[4rem] min-h-[4rem] rounded-[var(--radius-md)]')
            .exhaustive(),
          className,
        )}
        placeholderClassName="bg-black/6"
        alt={alt}
        loading="lazy"
        {...props}
      />
    )
  },
  (prev, next) =>
    prev.name === next.name && prev.size === next.size && prev.alt === next.alt && prev.className === next.className,
)

export interface SheetTitleProps {
  sheet: FlattenedSheet

  enableAltNames?: boolean
  enableClickToCopy?: boolean
  enableVersion?: boolean
  /** The heading element: `h3` in lists; the sheet dialog passes its labelled dialog title */
  headingComponent?: ElementType

  className?: string
}

export const SheetTitle: FC<SheetTitleProps> = ({
  sheet,
  enableAltNames,
  enableClickToCopy,
  enableVersion = true,
  headingComponent: Heading = 'h3',
  className,
}) => {
  const locale = useLocale()
  const { title, searchAcronyms, difficulty, type, version } = sheet
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-1">
        <Heading className={clsx(SHEET_HEADING_CLASS, 'min-w-0', className)}>
          <span className="flex flex-col min-w-0">
            <span className={SHEET_TITLE_TEXT_CLASS}>{title}</span>
          </span>
          <span className={SHEET_BADGES_CLASS}>
            <SheetType type={type} difficulty={difficulty} />
            <SheetDifficulty difficulty={difficulty} serverIds={sheet.serverIds} isLocked={sheet.isLocked} />
          </span>
        </Heading>
        {enableClickToCopy && (
          <IconButton
            size="small"
            // Centred on the title's first line: 22.5px tall below md (text-lg, leading-tight), 26px from md, the button 26px
            className="shrink-0 !-mt-[2px] md:!mt-0"
            aria-label={m.sheet_copyTitle_tooltip({}, { locale })}
            title={m.sheet_copyTitle_tooltip({}, { locale })}
            onClick={() => {
              navigator.clipboard.writeText(title)
              toast.success(m.sheet_copyTitle_toastSuccess({}, { locale }), {
                id: `copy-sheet-title-${title}`,
              })
            }}
          >
            <MdiContentCopy aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      {enableAltNames && (
        <div className="w-full font-semibold flex flex-col">
          {(searchAcronyms?.length ?? 0) > 0 && <SheetAltNames altNames={searchAcronyms!} />}
          <AddSheetAltNameButton sheet={sheet} />
        </div>
      )}

      {sheet.isTypeUtage && <SheetUtageComment comment={sheet.comment} />}

      {enableVersion && (
        <div className="text-sm">
          <span className="text-fg-2">ver. {version}</span>
        </div>
      )}
    </div>
  )
}