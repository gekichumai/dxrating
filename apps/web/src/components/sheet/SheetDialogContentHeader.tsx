import { formatErrorMessage } from '@/utils/formatErrorMessage'
import { IconButton } from '@mui/material'
import { motion } from 'framer-motion'
import { type FC, memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import MdiImageRemove from '~icons/mdi/image-remove'
import MdiLinkVariant from '~icons/mdi/link-variant'
import MdiStar from '~icons/mdi/star'
import MdiStarOutline from '~icons/mdi/star-outline'
import { useSheetFavoriteState } from '../../models/favorite'
import { captureAnalyticsEvent } from '../../lib/analytics'
import type { FlattenedSheet } from '../../songs'
import { buildSheetLink } from './sheetLinks'

export const SheetDialogContentHeader: FC<{ sheet: FlattenedSheet }> = memo(({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const [favored, toggleFavored] = useSheetFavoriteState(sheet.id)
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const variants = {
    collapsed: {
      height: '4rem',
      width: '4rem',
      borderRadius: '0.5rem',
      cursor: 'zoom-in',
    },
    expanded: {
      height: '14rem',
      width: '14rem',
      borderRadius: '1rem',
      cursor: 'zoom-out',
    },
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-start">
        <div className="text-xs text-zinc-400">#{sheet.internalId ?? '?'}</div>

        <div className="flex-1" />

        <IconButton
          size="small"
          onClick={() => {
            void navigator.clipboard
              .writeText(buildSheetLink(sheet))
              .then(() => {
                toast.success(t('sheet:copy-link.toast-success'), {
                  id: `copy-sheet-link-${sheet.id}`,
                })
              })
              .catch((error: unknown) => toast.error(formatErrorMessage(error)))
            captureAnalyticsEvent('sheet_link_copied', {
              song_id: sheet.songId,
              sheet_type: sheet.type,
              sheet_difficulty: sheet.difficulty,
            })
          }}
          title={t('sheet:copy-link.tooltip')}
          aria-label={t('sheet:copy-link.tooltip')}
        >
          <MdiLinkVariant />
        </IconButton>

        <IconButton
          size="small"
          onClick={() => {
            const newFavored = !favored
            toggleFavored()
            captureAnalyticsEvent('sheet_favorite_button_clicked', {
              favored: newFavored,
              song_id: sheet.songId,
              sheet_type: sheet.type,
              sheet_difficulty: sheet.difficulty,
            })
          }}
        >
          <motion.div
            layout
            variants={{
              favored: { rotate: 360 / 5 },
              unfavored: { rotate: 0 },
            }}
            initial={favored ? 'favored' : 'unfavored'}
            animate={favored ? 'favored' : 'unfavored'}
            transition={{
              type: 'spring',
              damping: 18,
              stiffness: 235,
            }}
          >
            {favored ? <MdiStar className="text-yellow-500" /> : <MdiStarOutline />}
          </motion.div>
        </IconButton>
      </div>
      <div className="flex items-center">
        {imgError ? (
          <motion.button
            aria-label={t('sheet:cover-art-alt', { title: sheet.title })}
            layout
            className="border-0 p-0 overflow-hidden rounded-lg bg-slate-300/50 flex items-center justify-center"
            variants={variants}
            initial="collapsed"
            animate={expanded ? 'expanded' : 'collapsed'}
            transition={{
              type: 'spring',
              damping: 18,
              stiffness: 235,
            }}
            onClick={() => setExpanded((prev) => !prev)}
            type="button"
            data-attr="sheet-image"
          >
            <MdiImageRemove className="text-zinc-400 text-2xl" />
          </motion.button>
        ) : (
          <motion.button
            type="button"
            layout
            className="overflow-hidden rounded-lg bg-slate-300/50"
            variants={variants}
            initial="collapsed"
            animate={expanded ? 'expanded' : 'collapsed'}
            transition={{
              type: 'spring',
              damping: 18,
              stiffness: 235,
            }}
            onClick={() => setExpanded((prev) => !prev)}
            data-attr="sheet-image"
            style={{ padding: 0, border: 0 }}
          >
            <img
              src={`https://shama.dxrating.net/images/cover/v2/${sheet.imageName}.jpg`}
              alt={t('sheet:cover-art-alt', { title: sheet.title })}
              onError={() => setImgError(true)}
              className="block h-full w-full"
            />
          </motion.button>
        )}

        <div className="flex-1" />

        <div className="text-4xl text-zinc-900/60 leading-none">
          {sheet.isTypeUtage ? sheet.level : sheet.internalLevelValue.toFixed(1)}
        </div>
      </div>
    </div>
  )
})