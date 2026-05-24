import { IconButton } from '@mui/material'
import { motion } from 'framer-motion'
import { usePostHog } from 'posthog-js/react'
import { type FC, memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import MdiImageRemove from '~icons/mdi/image-remove'
import MdiLinkVariant from '~icons/mdi/link-variant'
import MdiStar from '~icons/mdi/star'
import MdiStarOutline from '~icons/mdi/star-outline'
import { useSheetFavoriteState } from '../../models/favorite'
import type { FlattenedSheet } from '../../songs'
import { buildSheetLink } from './sheetLinks'

export const SheetDialogContentHeader: FC<{ sheet: FlattenedSheet }> = memo(({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const [favored, toggleFavored] = useSheetFavoriteState(sheet.id)
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const posthog = usePostHog()

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
            navigator.clipboard.writeText(buildSheetLink(sheet))
            toast.success(t('sheet:copy-link.toast-success'), {
              id: `copy-sheet-link-${sheet.id}`,
            })
            posthog?.capture('sheet_link_copied', {
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
            const newFavored = toggleFavored()
            posthog?.capture('sheet_favorite_button_clicked', {
              favored: newFavored,
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
          <motion.div
            layout
            className="overflow-hidden rounded-lg bg-slate-300/50 flex items-center justify-center"
            variants={variants}
            initial="collapsed"
            animate={expanded ? 'expanded' : 'collapsed'}
            transition={{
              type: 'spring',
              damping: 18,
              stiffness: 235,
            }}
            onClick={() => setExpanded((prev) => !prev)}
            role="button"
            data-attr="sheet-image"
          >
            <MdiImageRemove className="text-zinc-400 text-2xl" />
          </motion.div>
        ) : (
          <motion.img
            layout
            src={`https://shama.dxrating.net/images/cover/v2/${sheet.imageName}.jpg`}
            alt={t('sheet:cover-art-alt', { title: sheet.title })}
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
            onError={() => setImgError(true)}
            role="button"
            data-attr="sheet-image"
          />
        )}

        <div className="flex-1" />

        <div className="text-4xl text-zinc-900/60 leading-none">
          {sheet.isTypeUtage ? sheet.level : sheet.internalLevelValue.toFixed(1)}
        </div>
      </div>
    </div>
  )
})