import { coverUrl } from '@gekichumai/dxdata'
import { Button, ButtonGroup, IconButton, Tooltip } from '@mui/material'
import { motion, useReducedMotion } from 'motion/react'
import { type FC, type ReactNode, useState } from 'react'
import toast from 'react-hot-toast'
import IconMdiContentCopy from '~icons/mdi/content-copy'
import IconMdiSpotify from '~icons/mdi/spotify'
import IconMdiYouTube from '~icons/mdi/youtube'
import RiBilibiliFill from '~icons/ri/bilibili-fill'
import MdiImageRemove from '~icons/mdi/image-remove'
import type { FlattenedSheet } from '../../songs'
import { MaterialSurface } from '../global/MaterialSurface'
import { AddSheetAltNameButton } from '../sheet/AddSheetAltNameButton'
import { SheetAltNames } from '../sheet/SheetAltNames'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

// One outlined treatment for every search service: neutral ink (the brand glyph identifies the service), sentence
// case, and a hover tint only where hover exists
const searchButtonSx = {
  color: 'var(--fg-1)',
  borderColor: 'var(--glass-border)',
  textTransform: 'none',
  fontWeight: 600,
  '@media (hover: hover)': {
    '&:hover': {
      borderColor: 'var(--fg-2)',
      backgroundColor: 'var(--accent-subtle)',
    },
  },
  '@media (hover: none)': {
    '&:hover': { backgroundColor: 'transparent' },
  },
} as const

const BrandSearchButton: FC<{
  href: string
  icon: ReactNode
  children: ReactNode
  'aria-label'?: string
}> = ({ href, icon, children, 'aria-label': ariaLabel }) => (
  <Button
    size="small"
    variant="outlined"
    startIcon={icon}
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={ariaLabel}
    sx={searchButtonSx}
  >
    {children}
  </Button>
)

const COVER_SIZE = { collapsed: '5rem', expanded: '16rem' }

export const SongHeader: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const locale = useLocale()
  const [imgExpanded, setImgExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const reduceMotion = useReducedMotion()
  const song = sheet

  const coverSrc = coverUrl(song.songId)
  const coverSize = imgExpanded ? COVER_SIZE.expanded : COVER_SIZE.collapsed
  const newTab = m.sheet_searchLinks_newTab({}, { locale })

  const copyTitle = () => {
    navigator.clipboard.writeText(song.title)
    toast.success(m.sheet_copyTitle_toastSuccess({}, { locale }), { id: `copy-song-title-${song.songId}` })
  }

  return (
    <MaterialSurface as="header" className="p-3 flex flex-col gap-3">
      {/* Expanded, the cover leaves no usable width for the title on phones, so the metadata wraps below it
          once its column would drop under 12rem */}
      <div className={`flex items-start gap-3 ${imgExpanded ? 'flex-wrap' : ''}`}>
        <motion.button
          type="button"
          className="shrink-0 p-0 m-0 border-0 bg-black/5 rounded-[var(--radius-md)] overflow-hidden outline outline-1 -outline-offset-1 outline-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] flex items-center justify-center"
          style={{ cursor: imgExpanded ? 'zoom-out' : 'zoom-in', maxWidth: '100%' }}
          initial={false}
          animate={{ width: coverSize, height: coverSize }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
          onClick={() => setImgExpanded((p) => !p)}
          aria-pressed={imgExpanded}
          aria-label={m.sheet_coverZoom({ title: song.title }, { locale })}
        >
          {imgError ? (
            <MdiImageRemove aria-hidden className="text-fg-2 text-2xl" />
          ) : (
            <img
              src={coverSrc}
              alt=""
              className="block h-full w-full object-cover"
              draggable={false}
              onError={() => setImgError(true)}
            />
          )}
        </motion.button>

        <div className={`flex flex-col gap-1 flex-1 min-w-0 ${imgExpanded ? 'basis-[12rem]' : ''}`}>
          <div className="flex items-start gap-1">
            <h1
              lang="ja"
              translate="no"
              className="m-0 text-xl font-semibold leading-tight text-fg-1 break-words text-balance min-w-0"
            >
              {song.title}
            </h1>
            <Tooltip title={m.sheet_copyTitle_tooltip({}, { locale })}>
              <IconButton
                size="small"
                aria-label={m.sheet_copyTitle_tooltip({}, { locale })}
                onClick={copyTitle}
                className="shrink-0 !text-fg-2"
              >
                <IconMdiContentCopy aria-hidden className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </div>
          <div className="text-sm text-fg-1 break-words">{song.artist}</div>
          <div className="text-sm text-fg-2">{song.category}</div>
          <div className="w-full flex flex-col pt-1">
            {song.searchAcronyms.length > 0 && <SheetAltNames altNames={song.searchAcronyms} />}
            <AddSheetAltNameButton sheet={sheet} />
          </div>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-2">
        <BrandSearchButton
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`maimai ${song.title}`)}`}
          icon={<IconMdiYouTube aria-hidden />}
          aria-label={`${m.sheet_searchLinks_searchOn({ service: 'YouTube' }, { locale })} ${newTab}`}
        >
          YouTube
        </BrandSearchButton>

        <ButtonGroup
          size="small"
          variant="outlined"
          aria-label={m.sheet_searchLinks_searchOn({ service: 'bilibili' }, { locale })}
          sx={{ '& .MuiButtonGroup-grouped': searchButtonSx }}
        >
          <Button
            href={`bilibili://search?keyword=${encodeURIComponent(song.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<RiBilibiliFill aria-hidden />}
            aria-label={m.sheet_searchLinks_bilibiliApp({}, { locale })}
          >
            {m.sheet_searchLinks_app({}, { locale })}
          </Button>
          <Button
            href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(song.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${m.sheet_searchLinks_bilibiliWeb({}, { locale })} ${newTab}`}
          >
            {m.sheet_searchLinks_web({}, { locale })}
          </Button>
        </ButtonGroup>

        <BrandSearchButton
          href={`https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`}
          icon={<IconMdiSpotify aria-hidden />}
          aria-label={`${m.sheet_searchLinks_searchOn({ service: 'Spotify' }, { locale })} ${newTab}`}
        >
          Spotify
        </BrandSearchButton>
      </div>
    </MaterialSurface>
  )
}