import { type DifficultyEnum, type Regions, TypeEnum } from '@gekichumai/dxdata'
import { ListItemButton, ListItemSecondaryAction, ListItemText, type ListItemTextProps } from '@mui/material'
import clsx from 'clsx'
import { usePostHog } from 'posthog-js/react'
import { type FC, type HTMLAttributes, type ImgHTMLAttributes, memo, useState } from 'react'
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
import { SheetDialogContent, type SheetDialogContentProps } from './SheetDialogContent'

export const SheetListItem: FC<{
  size?: 'small' | 'medium'
  sheet: FlattenedSheet

  SheetListItemContentProps?: Omit<SheetListItemContentProps, 'sheet'>
  SheetDialogContentProps?: Omit<SheetDialogContentProps, 'sheet'>
}> = memo(({ size = 'medium', sheet, SheetListItemContentProps, SheetDialogContentProps }) => {
  const posthog = usePostHog()
  const [open, setOpen] = useState(false)
  const isLargeDevice = useIsLargeDevice()

  return (
    <>
      <ResponsiveDialog open={open} setOpen={setOpen}>
        {() => <SheetDialogContent sheet={sheet} {...SheetDialogContentProps} />}
      </ResponsiveDialog>

      <ListItemButton
        disableGutters={!isLargeDevice}
        className={clsx(
          'w-full cursor-pointer transition duration-500 hover:duration-25 !px-4',
          open && '!bg-zinc-300/80',
        )}
        onClick={() => {
          setOpen(true)
          posthog?.capture('sheet_content_viewed', {
            song_id: sheet.songId,
            sheet_type: sheet.type,
            sheet_difficulty: sheet.difficulty,
          })
        }}
        sx={{
          borderRadius: 1,
        }}
      >
        <SheetListItemContent sheet={sheet} size={size} {...SheetListItemContentProps} />
      </ListItemButton>
    </>
  )
})
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
    return (
      <div className={clsx('flex items-center w-full p-1 gap-2 tabular-nums relative', className)} {...rest}>
        {enableSheetImage && <SheetImage name={sheet.imageName} size={size} />}

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

const SHEET_TYPE_IMAGE = {
  [TypeEnum.DX]: 'https://shama.dxrating.net/images/type_dx.png',
  [TypeEnum.STD]: 'https://shama.dxrating.net/images/type_sd.png',
  [TypeEnum.UTAGE]: 'https://shama.dxrating.net/images/chart-type/type_utage.png',
}

const SheetType: FC<{ type: TypeEnum; difficulty: DifficultyEnum }> = ({ type, difficulty }) => {
  const isUtage = type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P

  if (isUtage) {
    const isUtage2P = type === TypeEnum.UTAGE2P

    return (
      <>
        <div
          className="h-26px w-95.875px flex items-center justify-center text-center select-none"
          style={{
            background: `url(${SHEET_TYPE_IMAGE[TypeEnum.UTAGE]}) no-repeat center`,
            backgroundSize: 'contain',
          }}
        >
          <span className="text-shadow-[0_0_0.5rem_#FFFFFF99] text-white text-xs">
            {difficulty.replace(/[【】]/g, '')}
          </span>
        </div>
        {isUtage2P && (
          <img
            src="https://shama.dxrating.net/images/chart-type/type_utage2p_endadornment.png"
            className="h-26px w-95.875px ml-[-27px] touch-callout-none"
            alt={type}
            draggable={false}
          />
        )}
      </>
    )
  }

  return (
    <img
      key={type}
      src={SHEET_TYPE_IMAGE[type]}
      className="h-26px w-70px touch-callout-none"
      alt={type}
      draggable={false}
    />
  )
}

export const SheetImage: FC<
  ImgHTMLAttributes<HTMLImageElement> & {
    name: string
    size?: 'small' | 'medium' | 'large'
  }
> = memo(
  ({ name, size = 'medium', ...props }) => {
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
        alt={name}
        loading="lazy"
        {...props}
      />
    )
  },
  (prev, next) => prev.name === next.name && prev.size === next.size,
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
                toast.success('Copied title to clipboard', {
                  id: `copy-sheet-title-${title}`,
                })
              },
              title: 'Click to copy',
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

export const SheetAltNames: FC<{ altNames: string[] }> = ({ altNames }) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={clsx('text-sm text-slate-600 overflow-hidden', !expanded && 'max-h-[7rem]')}
      style={{
        mask: expanded
          ? undefined
          : 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)',
        WebkitMask: expanded
          ? undefined
          : 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)',
      }}
      onClick={() => setExpanded(true)}
    >
      {altNames?.map((altName, i) => (
        <span className="inline-block whitespace-pre-line" key={altName}>
          <span
            className="cursor-pointer"
            onClick={() => {
              if (altName.length > 50) {
                const sanitizedAltName = altName.trim()
                navigator.clipboard.writeText(`${sanitizedAltName}是什么歌`)
                toast.success(`Copied ${sanitizedAltName}是什么歌 to clipboard`, {
                  id: `copy-sheet-alt-name-${altName}`,
                })
              } else {
                const sanitizedAltName = altName
                  .trim()
                  .replace(/[\s|\n|，|。|！|@|；|《|》|？|：|【|】|（|）|、|·|~|!|#|%|&|*|(|)|{|}|\\[|\\]|\\|]/g, '-')
                navigator.clipboard.writeText(`https://${sanitizedAltName}.是什么歌.com`)
                toast.success(`Copied ${sanitizedAltName}.是什么歌.com to clipboard`, {
                  id: `copy-sheet-alt-name-${altName}`,
                })
              }
            }}
          >
            {altName}
          </span>
          {i < altNames.length - 1 && <span className="text-slate-400 mx-1 select-none">/</span>}
        </span>
      ))}
    </div>
  )
}
