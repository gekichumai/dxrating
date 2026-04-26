import type { Song } from '@gekichumai/dxdata'
import { Button, ButtonGroup, IconButton } from '@mui/material'
import { motion } from 'framer-motion'
import { type FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import IconMdiSearchWeb from '~icons/mdi/search-web'
import IconMdiSpotify from '~icons/mdi/spotify'
import IconMdiYouTube from '~icons/mdi/youtube'
import RiBilibiliFill from '~icons/ri/bilibili-fill'
import MdiImageRemove from '~icons/mdi/image-remove'

export const SongHeader: FC<{ song: Song }> = ({ song }) => {
  const { t } = useTranslation(['sheet'])
  const [imgExpanded, setImgExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const coverUrl = `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`

  const imgVariants = {
    collapsed: { height: '5rem', width: '5rem', borderRadius: '0.75rem', cursor: 'zoom-in' },
    expanded: { height: '16rem', width: '16rem', borderRadius: '1rem', cursor: 'zoom-out' },
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        {imgError ? (
          <motion.div
            layout
            className="overflow-hidden bg-slate-300/50 flex items-center justify-center"
            variants={imgVariants}
            initial="collapsed"
            animate={imgExpanded ? 'expanded' : 'collapsed'}
            transition={{ type: 'spring', damping: 18, stiffness: 235 }}
            onClick={() => setImgExpanded((p) => !p)}
            role="button"
          >
            <MdiImageRemove className="text-zinc-400 text-2xl" />
          </motion.div>
        ) : (
          <motion.img
            layout
            src={coverUrl}
            alt={song.title}
            className="overflow-hidden bg-slate-300/50"
            variants={imgVariants}
            initial="collapsed"
            animate={imgExpanded ? 'expanded' : 'collapsed'}
            transition={{ type: 'spring', damping: 18, stiffness: 235 }}
            onClick={() => setImgExpanded((p) => !p)}
            onError={() => setImgError(true)}
            role="button"
          />
        )}

        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <h1
            className="text-xl font-bold leading-tight cursor-pointer truncate"
            onClick={() => {
              navigator.clipboard.writeText(song.title)
              toast.success(t('sheet:copy-title.toast-success'), { id: `copy-song-title-${song.songId}` })
            }}
            title={t('sheet:copy-title.tooltip')}
          >
            {song.title}
          </h1>
          <div className="text-sm text-zinc-600">{song.artist}</div>
          <div className="text-sm text-zinc-500">{song.category}</div>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-1">
        <IconMdiSearchWeb className="mr-1" />

        <Button
          size="small"
          startIcon={<IconMdiYouTube />}
          variant="outlined"
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`maimai ${song.title}`)}`}
          target="_blank"
          className="inline-flex !text-[#ff0000] !b-[#ff0000] !hover:bg-[#ff000009] font-bold"
        >
          YouTube
        </Button>

        <div className="inline-flex !text-[#00A1D6] !b-[#00A1D6] b-solid b-1 rounded-xl items-center">
          <RiBilibiliFill className="ml-2.5" />
          <ButtonGroup size="small">
            <Button
              href={`bilibili://search?keyword=${encodeURIComponent(song.title)}`}
              target="_blank"
              className="!rounded-none !text-[#00A1D6] !hover:bg-[#00A1D609] font-bold !b-none"
            >
              App
            </Button>
            <Button
              href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(song.title)}`}
              target="_blank"
              className="!rounded-none !text-[#00A1D6] !hover:bg-[#00A1D609] font-bold !b-none"
            >
              Web
            </Button>
          </ButtonGroup>
        </div>

        <IconButton
          size="small"
          href={`https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`}
          target="_blank"
          className="inline-flex !text-[#1db954]"
        >
          <IconMdiSpotify className="h-5 w-5" />
        </IconButton>
      </div>
    </div>
  )
}