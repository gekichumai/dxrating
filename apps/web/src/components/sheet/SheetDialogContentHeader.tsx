import { coverUrl } from '@gekichumai/dxdata'
import { IconButton } from '@mui/material'
import { motion } from 'motion/react'
import { type FC, memo, useState } from 'react'
import toast from 'react-hot-toast'
import MdiClose from '~icons/mdi/close'
import MdiImageRemove from '~icons/mdi/image-remove'
import MdiLinkVariant from '~icons/mdi/link-variant'
import MdiStar from '~icons/mdi/star'
import MdiStarOutline from '~icons/mdi/star-outline'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { useSheetFavoriteState } from '../../models/favorite'
import { captureAnalyticsEvent } from '../../lib/analytics'
import type { FlattenedSheet } from '../../songs'
import { buildSheetLink } from './sheetLinks'
import { sheetStateSpring } from './sheetMotion'

export const SheetDialogContentHeader: FC<{ sheet: FlattenedSheet; onClose?: () => void }> = memo(
  ({ sheet, onClose }) => {
    const locale = useLocale()
    const [favored, toggleFavored] = useSheetFavoriteState(sheet.id)
    const [expanded, setExpanded] = useState(false)
    const [imgError, setImgError] = useState(false)

    const variants = {
      collapsed: {
        height: '4rem',
        width: '4rem',
        borderRadius: 'var(--radius-md)',
        cursor: 'zoom-in',
      },
      expanded: {
        height: '14rem',
        width: '14rem',
        borderRadius: 'var(--radius-xl)',
        cursor: 'zoom-out',
      },
    }

    return (
      <div className="flex flex-col">
        <div className="flex items-start">
          {/* The game's internal chart ID; charts too new to have one known yet show nothing */}
          {typeof sheet.internalId === 'number' && <div className="text-xs text-fg-2 num">#{sheet.internalId}</div>}

          <div className="flex-1" />

          <IconButton
            size="small"
            onClick={() => {
              // The link opens the chart in the language it was copied from
              navigator.clipboard.writeText(buildSheetLink(sheet, undefined, locale))
              toast.success(m.sheet_copyLink_toastSuccess({}, { locale }), {
                id: `copy-sheet-link-${sheet.id}`,
              })
              captureAnalyticsEvent('sheet_link_copied', {
                song_id: sheet.songId,
                sheet_type: sheet.type,
                sheet_difficulty: sheet.difficulty,
              })
            }}
            title={m.sheet_copyLink_tooltip({}, { locale })}
            aria-label={m.sheet_copyLink_tooltip({}, { locale })}
          >
            <MdiLinkVariant aria-hidden="true" />
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
            aria-label={favored ? m.sheet_favorite_remove({}, { locale }) : m.sheet_favorite_add({}, { locale })}
            aria-pressed={favored}
            title={favored ? m.sheet_favorite_remove({}, { locale }) : m.sheet_favorite_add({}, { locale })}
          >
            <motion.div
              layout
              variants={{
                favored: { rotate: 360 / 5 },
                unfavored: { rotate: 0 },
              }}
              initial={favored ? 'favored' : 'unfavored'}
              animate={favored ? 'favored' : 'unfavored'}
              transition={sheetStateSpring}
            >
              {favored ? (
                <MdiStar aria-hidden="true" className="text-status-warning" />
              ) : (
                <MdiStarOutline aria-hidden="true" />
              )}
            </motion.div>
          </IconButton>

          {onClose && (
            <IconButton
              size="small"
              onClick={onClose}
              aria-label={m.sheet_dialogClose({}, { locale })}
              title={m.sheet_dialogClose({}, { locale })}
            >
              <MdiClose aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <div className="flex items-center">
          {/* A real button so the cover can be enlarged from the keyboard; the spring is dropped under reduced motion */}
          <button
            type="button"
            className="cursor-pointer rounded-[var(--radius-md)] border-0 bg-transparent p-0"
            aria-expanded={expanded}
            aria-label={expanded ? m.sheet_cover_shrink({}, { locale }) : m.sheet_cover_enlarge({}, { locale })}
            onClick={() => setExpanded((prev) => !prev)}
            data-attr="sheet-image"
          >
            {imgError ? (
              <motion.div
                layout
                className="overflow-hidden bg-black/6 flex items-center justify-center"
                variants={variants}
                initial="collapsed"
                animate={expanded ? 'expanded' : 'collapsed'}
                transition={sheetStateSpring}
              >
                <MdiImageRemove aria-hidden="true" className="text-fg-2 text-2xl" />
              </motion.div>
            ) : (
              <motion.img
                layout
                src={coverUrl(sheet.songId)}
                alt={m.sheet_coverArtAlt({ title: sheet.title }, { locale })}
                className="block overflow-hidden bg-black/6 outline outline-1 -outline-offset-1 outline-black/10"
                variants={variants}
                initial="collapsed"
                animate={expanded ? 'expanded' : 'collapsed'}
                transition={sheetStateSpring}
                onError={() => setImgError(true)}
              />
            )}
          </button>

          <div className="flex-1" />

          <div className="text-4xl font-semibold display-num text-fg-2 leading-none">
            {sheet.isTypeUtage ? sheet.level : sheet.internalLevelValue.toFixed(1)}
          </div>
        </div>
      </div>
    )
  },
)