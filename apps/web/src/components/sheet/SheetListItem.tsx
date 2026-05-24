import { type DifficultyEnum, type Regions, TypeEnum } from '@gekichumai/dxdata'
import { ListItemButton, ListItemSecondaryAction, ListItemText, type ListItemTextProps } from '@mui/material'
import clsx from 'clsx'
import { usePostHog } from 'posthog-js/react'
import { type FC, type HTMLAttributes, type ImgHTMLAttributes, memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWebHaptics } from 'web-haptics/react'
import toast from 'react-hot-toast'
import { match } from 'ts-pattern'
import MdiComment from '~icons/mdi/comment'
import MdiLock from '~icons/mdi/lock'
import MdiTrashCan from '~icons/mdi/trash-can'
import { DIFFICULTIES } from '../../models/difficulties'
import type { FlattenedSheet } from '../../songs'
import { useIsLargeDevice } from '../../utils/breakpoints'
import { FadedImage } from '../global/FadedImage'
import { ResponsiveDialog } from '../global/ResponsiveDialog'
import { AddSheetAltNameButton } from './AddSheetAltNameButton'
import { SheetAltNames } from './SheetAltNames'
import { SheetDialogContent, type SheetDialogContentProps } from './SheetDialogContent'
import { buildSheetPath } from './sheetLinks'
import { getSheetTypeAltTextKey, SHEET_TYPE_IMAGES, SHEET_TYPE_UTAGE_2P_END_ADORNMENT_IMAGE } from './sheetTypeAssets'

export const SheetListItem: FC<{
  size?: 'small' | 'medium'
  sheet: FlattenedSheet
  dialogOpen?: boolean
  onDialogOpenChange?: (open: boolean) => void

  SheetListItemContentProps?: Omit<SheetListItemContentProps, 'sheet'>
  SheetDialogContentProps?: Omit<SheetDialogContentProps, 'sheet'>
}> = memo(
  ({ size = 'medium', sheet, dialogOpen, onDialogOpenChange, SheetListItemContentProps, SheetDialogContentProps }) => {
    const posthog = usePostHog()
    const haptic = useWebHaptics()
    const [internalOpen, setInternalOpen] = useState(false)
    const isLargeDevice = useIsLargeDevice()

    const isControlled = dialogOpen !== undefined
    const open = isControlled ? dialogOpen : internalOpen
    const setOpen = isControlled ? (v: boolean) => onDialogOpenChange?.(v) : setInternalOpen

    return (
      <>
        {!isControlled && (
          <ResponsiveDialog open={open} setOpen={setOpen}>
            {() => <SheetDialogContent sheet={sheet} {...SheetDialogContentProps} />}
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
            posthog?.capture('sheet_content_viewed', {
              song_id: sheet.songId,
              sheet_type: sheet.type,
              sheet_difficulty: sheet.difficulty,
            })
          }}
          disableGutters={!isLargeDevice}
          className={clsx(
            'w-full cursor-pointer transition duration-500 hover:duration-25 !px-4 no-underline text-inherit',
            open && '!bg-zinc-300/80',
          )}
          sx={{ borderRadius: 1 }}
        >
          <SheetListItemContent sheet={sheet} size={size} {...SheetListItemContentProps} />
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

export const SheetListItemContent: FC<SheetListItemContentProps> = memo(
  ({ sheet, size = 'medium', className, enableSheetImage = true, SheetTitleProps, ListItemTextProps, ...rest }) => {
    const { t } = useTranslation(['sheet'])

    return (
      <div className={clsx('flex items-center w-full p-1 gap-2 tabular-nums relative', className)} {...rest}>
        {enableSheetImage && (
          <SheetImage name={sheet.imageName} size={size} alt={t('sheet:cover-art-alt', { title: sheet.title })} />
        )}

        <ListItemText {...ListItemTextProps} className={clsx('ml-2 pr-12', ListItemTextProps?.className)}>
          <SheetTitle
            {...SheetTitleProps}
            sheet={sheet}
            className={clsx('font-bold', size === 'small' ? 'text-sm' : 'text-lg', SheetTitleProps?.className)}
          />
        </ListItemText>

        <ListItemSecondaryAction>
          {sheet.isTypeUtage ? (
            <span className="font-bold tracking-tighter tabular-nums text-lg text-zinc-600">{sheet.level}</span>
          ) : (
            <SheetInternalLevelValue value={sheet.internalLevelValue} />
          )}
        </ListItemSecondaryAction>
      </div>
    )
  },
)
SheetListItem.displayName = 'SheetListItem'

const SheetInternalLevelValue: FC<{ value: number }> = ({ value }) => {
  const wholePart = Math.floor(value)
  const decimalPart = value - wholePart

  return (
    <div className="font-bold tracking-tighter tabular-nums">
      <span className="text-lg text-zinc-600">{wholePart}.</span>
      <span className="text-xl">{decimalPart.toFixed(1).split('.')[1]}</span>
    </div>
  )
}

export const SheetDifficulty: FC<{
  difficulty?: DifficultyEnum
  regions?: Regions
  isLocked?: boolean
}> = ({ difficulty, regions, isLocked }) => {
  const difficultyConfig = difficulty ? DIFFICULTIES[difficulty] : undefined
  const allUnavailable = Object.values(regions ?? {}).every((v) => !v)
  return difficultyConfig ? (
    <span
      className="rounded-full px-2 text-sm shadow-[0.0625rem_0.125rem_0_0_#0b38714D] leading-relaxed translate-y-[-0.125rem] text-white inline-flex items-center"
      style={{ backgroundColor: difficultyConfig.color }}
    >
      {allUnavailable && (
        <MdiTrashCan
          className="h-4 w-4 mr-1.5 -ml-1 p-0.5 bg-white rounded-full"
          style={{ color: difficultyConfig.color }}
        />
      )}
      {isLocked && (
        <MdiLock
          className="h-4 w-4 mr-1.5 -ml-1 p-0.5 bg-white rounded-full"
          style={{ color: difficultyConfig.color }}
        />
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
          'overflow-hidden',
          match(size)
            .with('small', () => 'h-8 w-8 min-w-[2rem] min-h-[2rem] rounded-sm')
            .with('medium', () => 'h-12 w-12 min-w-[3rem] min-h-[3rem] rounded')
            .with('large', () => 'h-16 w-16 min-w-[4rem] min-h-[4rem] rounded-lg')
            .exhaustive(),
        )}
        placeholderClassName="bg-slate-300/50"
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

  className?: string
}

export const SheetTitle: FC<SheetTitleProps> = ({
  sheet,
  enableAltNames,
  enableClickToCopy,
  enableVersion = true,
  className,
}) => {
  const { t } = useTranslation(['sheet'])
  const { title, searchAcronyms, difficulty, type, version } = sheet
  return (
    <div className="flex flex-col">
      <h3 className={clsx('flex flex-col md:flex-row md:items-start gap-x-2 gap-y-1', className)}>
        <span className="flex flex-col">
          <span
            className="leading-tight cursor-pointer"
            {...(enableClickToCopy && {
              onClick: () => {
                navigator.clipboard.writeText(title)
                toast.success(t('sheet:copy-title.toast-success'), {
                  id: `copy-sheet-title-${title}`,
                })
              },
              title: t('sheet:copy-title.tooltip'),
            })}
          >
            {title}
          </span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <SheetType type={type} difficulty={difficulty} />
          <SheetDifficulty difficulty={difficulty} regions={sheet.regions} isLocked={sheet.isLocked} />
        </div>
      </h3>

      {enableAltNames && (
        <div className="w-full font-bold flex flex-col">
          {(searchAcronyms?.length ?? 0) > 0 && <SheetAltNames altNames={searchAcronyms!} />}
          <AddSheetAltNameButton sheet={sheet} />
        </div>
      )}

      {sheet.isTypeUtage && (
        <span className="text-sm text-zinc-600 px-1.5 py-0.5 gap-1 bg-amber/75 inline-flex self-start rounded-md">
          <MdiComment className="h-3 w-3 flex-shrink-0 mt-1.125" />
          <span>{sheet.comment}</span>
        </span>
      )}

      {enableVersion && (
        <div className="text-sm">
          <span className="text-zinc-600">ver. {version}</span>
        </div>
      )}
    </div>
  )
}