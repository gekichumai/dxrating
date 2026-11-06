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
import { useTranslation } from 'react-i18next'
import { useWebHaptics } from 'web-haptics/react'
import toast from 'react-hot-toast'
import { match } from 'ts-pattern'
import MdiComment from '~icons/mdi/comment'
import MdiContentCopy from '~icons/mdi/content-copy'
import MdiLock from '~icons/mdi/lock'
import MdiTrashCan from '~icons/mdi/trash-can'
import { DIFFICULTIES } from '../../models/difficulties'
import { captureAnalyticsEvent, type SheetViewSource } from '../../lib/analytics'
import type { FlattenedSheet } from '../../songs'
import { FadedImage } from '../global/FadedImage'
import { ResponsiveDialog } from '../global/ResponsiveDialog'
import { AddSheetAltNameButton } from './AddSheetAltNameButton'
import { SheetAltNames } from './SheetAltNames'
import { SheetDialogContent, type SheetDialogContentProps } from './SheetDialogContent'
import { buildSheetPath } from './sheetLinks'
import { getSheetTypeAltTextKey, SHEET_TYPE_IMAGES, SHEET_TYPE_UTAGE_2P_END_ADORNMENT_IMAGE } from './sheetTypeAssets'

export interface SheetListItemAnalyticsProps {
  source: SheetViewSource
  position?: number
  queryPresent?: boolean
  resultCount?: number
}

export const SheetListItem: FC<{
  size?: 'small' | 'medium'
  className?: string
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
    children,
    sheet,
    dialogOpen,
    onDialogOpenChange,
    SheetListItemContentProps,
    SheetDialogContentProps,
    analytics,
  }) => {
    const haptic = useWebHaptics()
    const [internalOpen, setInternalOpen] = useState(false)

    const isControlled = dialogOpen !== undefined
    const open = isControlled ? dialogOpen : internalOpen
    const setOpen = isControlled ? (v: boolean) => onDialogOpenChange?.(v) : setInternalOpen

    return (
      <>
        {!isControlled && (
          <ResponsiveDialog open={open} setOpen={setOpen} hideCloseButton>
            {() => <SheetDialogContent sheet={sheet} onClose={() => setOpen(false)} {...SheetDialogContentProps} />}
          </ResponsiveDialog>
        )}

        <ListItemButton
          component="a"
          href={buildSheetPath(sheet)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
            e.preventDefault()
            setOpen(true)
            haptic.trigger('medium')
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
          }}
          // Horizontal padding is fixed by !px-4 at every width. Gutters must not depend on the viewport (a window-width
          // hook renders "mobile" on the server and changed the class during hydration on wide screens), so the
          // secondary action's offset that disableGutters used to set (0 on phones, 16px from md) is CSS instead
          className={clsx(
            'w-full cursor-pointer transition-colors duration-150 hover:duration-25 !px-4 no-underline text-inherit',
            '[&_.MuiListItemSecondaryAction-root]:right-0 md:[&_.MuiListItemSecondaryAction-root]:right-4',
            open && '!bg-accent-subtle',
            className,
          )}
          // --radius-md rows inside a list surface with a 4px inset: 8 + 4 = the surface's 12
          sx={{ borderRadius: 'var(--radius-md)' }}
        >
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
    return (
      <div className={clsx('flex items-center w-full p-1 gap-2 tabular-nums relative', className)} {...rest}>
        {enableSheetImage && imageName && imageAlt && <SheetImage name={imageName} size={size} alt={imageAlt} />}

        <ListItemText {...ListItemTextProps} className={clsx('ml-2 min-w-0', ListItemTextProps?.className)}>
          {children}
        </ListItemText>

        {/* A flex child rather than an absolutely positioned action, so long titles and badges can never run under it */}
        <div className="ml-auto shrink-0 pl-2">
          {isTypeUtage ? (
            <span className="font-semibold tabular-nums text-lg text-fg-2">{level}</span>
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
    const { t } = useTranslation(['sheet'])

    return (
      <SheetListItemContentView
        level={sheet.level}
        internalLevelValue={sheet.internalLevelValue}
        isTypeUtage={sheet.isTypeUtage}
        size={size}
        className={className}
        enableSheetImage={enableSheetImage}
        imageName={sheet.imageName}
        imageAlt={t('sheet:cover-art-alt', { title: sheet.title })}
        ListItemTextProps={ListItemTextProps}
        {...rest}
      >
        <SheetTitle
          {...SheetTitleProps}
          sheet={sheet}
          className={clsx('font-semibold', size === 'small' ? 'text-sm' : 'text-lg', SheetTitleProps?.className)}
        />
      </SheetListItemContentView>
    )
  },
)
SheetListItemContent.displayName = 'SheetListItemContent'

const SheetInternalLevelValue: FC<{ value: number }> = ({ value }) => {
  const wholePart = Math.floor(value)
  const decimalPart = value - wholePart

  return (
    <div className="font-semibold tabular-nums">
      <span className="text-lg text-fg-2">{wholePart}.</span>
      <span className="text-xl text-fg-1">{decimalPart.toFixed(1).split('.')[1]}</span>
    </div>
  )
}

export const SheetDifficulty: FC<{
  difficulty?: DifficultyEnum
  serverIds?: readonly ServerEnum[]
  isLocked?: boolean
}> = ({ difficulty, serverIds, isLocked }) => {
  const { t } = useTranslation(['sheet'])
  const difficultyConfig = difficulty ? DIFFICULTIES[difficulty] : undefined
  const allUnavailable = (serverIds ?? []).length === 0
  // The `solid` role carries white text at 4.5:1 or more; the brand colour itself only passes for MASTER
  return difficultyConfig ? (
    <span
      className="rounded-[var(--radius-sm)] px-2 text-sm font-semibold shadow-[0_1px_0_0_rgb(0_0_0/0.15)] leading-relaxed translate-y-[-0.125rem] text-white inline-flex items-center"
      style={{ backgroundColor: difficultyConfig.solid }}
    >
      {allUnavailable && (
        <>
          <MdiTrashCan
            aria-hidden="true"
            className="h-4 w-4 mr-1.5 -ml-1 p-0.5 bg-[#fff] rounded-full"
            style={{ color: difficultyConfig.solid }}
          />
          <span className="sr-only">{t('sheet:badge.unavailable')}</span>
        </>
      )}
      {isLocked && (
        <>
          <MdiLock
            aria-hidden="true"
            className="h-4 w-4 mr-1.5 -ml-1 p-0.5 bg-[#fff] rounded-full"
            style={{ color: difficultyConfig.solid }}
          />
          <span className="sr-only">{t('sheet:badge.locked')}</span>
        </>
      )}
      {difficultyConfig.title}
    </span>
  ) : null
}

const SheetType: FC<{ type: TypeEnum; difficulty: DifficultyEnum }> = ({ type, difficulty }) => {
  const { t } = useTranslation(['sheet'])
  const isUtage = type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P
  const altText = t(getSheetTypeAltTextKey(type))

  if (isUtage) {
    const isUtage2P = type === TypeEnum.UTAGE2P

    return (
      <div className="inline-flex items-center">
        <div className="relative h-26px w-95.875px flex items-center justify-center text-center select-none">
          <img
            src={SHEET_TYPE_IMAGES[TypeEnum.UTAGE]}
            alt={altText}
            className="absolute inset-0 h-full w-full object-contain touch-callout-none"
            draggable={false}
          />
          <span aria-hidden="true" className="relative text-shadow-[0_0_0.5rem_#FFFFFF99] text-white text-xs">
            {difficulty.replace(/[【】]/g, '')}
          </span>
        </div>
        {isUtage2P && (
          <img
            src={SHEET_TYPE_UTAGE_2P_END_ADORNMENT_IMAGE}
            className="h-26px w-95.875px ml-[-27px] touch-callout-none"
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
      className="h-26px w-70px touch-callout-none"
      alt={altText}
      draggable={false}
    />
  )
}

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
    return (
      <div className={clsx('flex flex-col', className)}>
        <TitleElement
          {...titleProps}
          className={clsx(
            'flex flex-col md:flex-row md:items-start gap-x-2 gap-y-1 font-semibold text-lg',
            titleProps?.className,
          )}
        >
          <span className="flex flex-col min-w-0">
            <span
              {...titleTextProps}
              className={clsx(
                'leading-tight [text-wrap:pretty] [word-break:auto-phrase] [overflow-wrap:anywhere]',
                titleTextProps?.className,
              )}
            >
              {title}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <SheetType type={type} difficulty={difficulty} />
            <SheetDifficulty difficulty={difficulty} serverIds={serverIds} isLocked={isLocked} />
          </div>
        </TitleElement>

        {artist && (
          <p {...artistProps} className={clsx('text-sm text-fg-2 truncate', artistProps?.className)}>
            {artist}
          </p>
        )}

        {version && (
          <div className="text-sm">
            <span className="text-fg-2">ver. {version}</span>
          </div>
        )}

        {metadata}
      </div>
    )
  },
)
SheetListItemSummary.displayName = 'SheetListItemSummary'

export const SheetImage: FC<
  Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> & {
    name: string
    size?: 'small' | 'medium' | 'large'
    alt: string
  }
> = memo(
  ({ name, size = 'medium', alt, ...props }) => {
    return (
      <FadedImage
        key={name}
        src={`https://shama.dxrating.net/images/cover/v2/${name}.jpg`}
        className={clsx(
          'overflow-hidden outline outline-1 -outline-offset-1 outline-black/10',
          match(size)
            .with('small', () => 'h-8 w-8 min-w-[2rem] min-h-[2rem] rounded-[var(--radius-xs)]')
            .with('medium', () => 'h-12 w-12 min-w-[3rem] min-h-[3rem] rounded-[var(--radius-xs)]')
            .with('large', () => 'h-16 w-16 min-w-[4rem] min-h-[4rem] rounded-[var(--radius-md)]')
            .exhaustive(),
        )}
        placeholderClassName="bg-black/6"
        alt={alt}
        loading="lazy"
        {...props}
      />
    )
  },
  (prev, next) => prev.name === next.name && prev.size === next.size && prev.alt === next.alt,
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
  const { t } = useTranslation(['sheet'])
  const { title, searchAcronyms, difficulty, type, version } = sheet
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-1">
        <Heading className={clsx('flex flex-col md:flex-row md:items-start gap-x-2 gap-y-1 min-w-0', className)}>
          <span className="flex flex-col min-w-0">
            <span className="leading-tight [text-wrap:pretty] [word-break:auto-phrase] [overflow-wrap:anywhere]">
              {title}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <SheetType type={type} difficulty={difficulty} />
            <SheetDifficulty difficulty={difficulty} serverIds={sheet.serverIds} isLocked={sheet.isLocked} />
          </span>
        </Heading>
        {enableClickToCopy && (
          <IconButton
            size="small"
            className="shrink-0 !-mt-1"
            aria-label={t('sheet:copy-title.tooltip')}
            title={t('sheet:copy-title.tooltip')}
            onClick={() => {
              navigator.clipboard.writeText(title)
              toast.success(t('sheet:copy-title.toast-success'), {
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

      {sheet.isTypeUtage && (
        <span className="text-sm text-zinc-600 dark:text-[#3f3f46] px-1.5 py-0.5 gap-1 bg-amber/75 inline-flex self-start rounded-md">
          <MdiComment aria-hidden="true" className="h-3 w-3 flex-shrink-0 mt-1.125" />
          <span>{sheet.comment}</span>
        </span>
      )}

      {enableVersion && (
        <div className="text-sm">
          <span className="text-fg-2">ver. {version}</span>
        </div>
      )}
    </div>
  )
}