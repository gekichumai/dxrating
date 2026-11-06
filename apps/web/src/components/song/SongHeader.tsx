import { Button, ButtonGroup, IconButton, Tooltip } from '@mui/material'
import { motion, useReducedMotion } from 'framer-motion'
import { type FC, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation(['sheet'])
  const [imgExpanded, setImgExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const reduceMotion = useReducedMotion()
  const song = sheet

  const coverUrl = `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`
  const coverSize = imgExpanded ? COVER_SIZE.expanded : COVER_SIZE.collapsed
  const newTab = t('sheet:search-links.new-tab')

  const copyTitle = () => {
    navigator.clipboard.writeText(song.title)
    toast.success(t('sheet:copy-title.toast-success'), { id: `copy-song-title-${song.songId}` })
  }

  return (
    <MaterialSurface as="header" className="p-3 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <motion.button
          type="button"
          className="shrink-0 p-0 m-0 border-0 bg-black/5 rounded-[var(--radius-md)] overflow-hidden outline outline-1 -outline-offset-1 outline-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] flex items-center justify-center"
          style={{ cursor: imgExpanded ? 'zoom-out' : 'zoom-in' }}
          initial={false}
          animate={{ width: coverSize, height: coverSize }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
          onClick={() => setImgExpanded((p) => !p)}
          aria-pressed={imgExpanded}
          aria-label={t('sheet:cover-zoom', { title: song.title })}
        >
          {imgError ? (
            <MdiImageRemove aria-hidden className="text-fg-2 text-2xl" />
          ) : (
            <img
              src={coverUrl}
              alt=""
              className="block h-full w-full object-cover"
              draggable={false}
              onError={() => setImgError(true)}
            />
          )}
        </motion.button>

        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-start gap-1">
            <h1
              lang="ja"
              translate="no"
              className="m-0 text-xl font-semibold leading-tight text-fg-1 break-words text-balance min-w-0"
            >
              {song.title}
            </h1>
            <Tooltip title={t('sheet:copy-title.tooltip')}>
              <IconButton
                size="small"
                aria-label={t('sheet:copy-title.tooltip')}
                onClick={copyTitle}
                className="shrink-0 -mt-1 !text-fg-2"
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
          aria-label={`${t('sheet:search-links.search-on', { service: 'YouTube' })} ${newTab}`}
        >
          YouTube
        </BrandSearchButton>

        <ButtonGroup
          size="small"
          variant="outlined"
          aria-label={t('sheet:search-links.search-on', { service: 'bilibili' })}
          sx={{ '& .MuiButtonGroup-grouped': searchButtonSx }}
        >
          <Button
            href={`bilibili://search?keyword=${encodeURIComponent(song.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<RiBilibiliFill aria-hidden />}
            aria-label={t('sheet:search-links.bilibili-app')}
          >
            {t('sheet:search-links.app')}
          </Button>
          <Button
            href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(song.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t('sheet:search-links.bilibili-web')} ${newTab}`}
          >
            {t('sheet:search-links.web')}
          </Button>
        </ButtonGroup>

        <BrandSearchButton
          href={`https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`}
          icon={<IconMdiSpotify aria-hidden />}
          aria-label={`${t('sheet:search-links.search-on', { service: 'Spotify' })} ${newTab}`}
        >
          Spotify
        </BrandSearchButton>
      </div>
    </MaterialSurface>
  )
}