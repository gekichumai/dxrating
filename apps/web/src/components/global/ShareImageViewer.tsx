import { Button } from '@mui/material'
import { type FC, type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import MdiContentCopy from '~icons/mdi/content-copy'
import MdiDownload from '~icons/mdi/download'
import MdiShareVariant from '~icons/mdi/share-variant'
import type { ShareImageOutcome } from '@/lib/analytics'
import {
  canCopyImage,
  canShareImageFile,
  copyImage,
  downloadImage,
  shareImageFile,
} from '@/utils/shareImage/shareImage'
import { ResponsiveDialog } from './ResponsiveDialog'

/** An object URL for the blob, revoked when the blob changes or the component unmounts */
export const useObjectUrl = (blob: Blob | null | undefined) => {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

export interface ShareImageActionsProps {
  blob: Blob
  filename: string
  shareTitle?: string
  onOutcome?: (outcome: ShareImageOutcome) => void
}

/**
 * Save, copy and (where the browser has one) the system share sheet for a rendered PNG. Save and copy come first
 * because the share sheet is awkward on desktop; on phones the image itself can also be long-pressed.
 */
export const ShareImageActions: FC<ShareImageActionsProps> = ({ blob, filename, shareTitle, onOutcome }) => {
  const { t } = useTranslation(['share'])
  // Capabilities are read after mount: the dialog is client-only, but this keeps the first render deterministic
  const [support, setSupport] = useState({ copy: false, share: false })
  useEffect(() => {
    setSupport({ copy: canCopyImage(), share: canShareImageFile(blob, filename) })
  }, [blob, filename])

  const handleCopy = async () => {
    try {
      await copyImage(blob)
      toast.success(t('share:image.copied'))
      onOutcome?.('copied')
    } catch (error) {
      console.error(error)
      toast.error(t('share:image.copy-failed'))
      onOutcome?.('failed')
    }
  }

  const handleShare = async () => {
    const outcome = await shareImageFile(blob, filename, shareTitle)
    if (outcome === 'failed') toast.error(t('share:image.share-failed'))
    onOutcome?.(outcome)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="contained"
        startIcon={<MdiDownload aria-hidden="true" />}
        onClick={() => {
          downloadImage(blob, filename)
          onOutcome?.('downloaded')
        }}
      >
        {t('share:image.download')}
      </Button>
      {support.copy && (
        <Button variant="outlined" startIcon={<MdiContentCopy aria-hidden="true" />} onClick={() => void handleCopy()}>
          {t('share:image.copy')}
        </Button>
      )}
      {support.share && (
        <Button
          variant="outlined"
          startIcon={<MdiShareVariant aria-hidden="true" />}
          onClick={() => void handleShare()}
        >
          {t('share:image.share')}
        </Button>
      )}
    </div>
  )
}

export interface ShareImageViewerProps extends ShareImageActionsProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  alt: string
}

/**
 * Shows a rendered PNG as a real <img> (long-press or right-click to save or copy). The actions sit above the image so
 * they stay in reach when a tall image scrolls.
 */
export const ShareImageViewer: FC<ShareImageViewerProps> = ({ open, onClose, title, alt, ...actions }) => {
  const { t } = useTranslation(['share'])
  const url = useObjectUrl(actions.blob)
  return (
    <ResponsiveDialog
      open={open}
      setOpen={(next) => !next && onClose()}
      maxWidth="sm"
      title={title ?? t('share:image.viewer-title')}
    >
      {() => (
        <div className="flex flex-col gap-3">
          <ShareImageActions {...actions} />
          <p className="m-0 text-xs text-fg-2">{t('share:image.hint')}</p>
          {url && (
            <img
              src={url}
              alt={alt}
              className="block w-full h-auto rounded-[var(--radius-md)] outline outline-1 -outline-offset-1 outline-[var(--glass-border)] [-webkit-touch-callout:default]"
              style={{ boxShadow: 'var(--shadow-overlay)' }}
            />
          )}
        </div>
      )}
    </ResponsiveDialog>
  )
}