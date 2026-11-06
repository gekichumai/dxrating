import { Button, type ButtonProps, CircularProgress } from '@mui/material'
import { type FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import MdiImage from '~icons/mdi/image-outline'
import type { ShareImageOutcome } from '@/lib/analytics'
import { renderShareImage, type ShareImageSpec } from '@/utils/shareImage/shareImage'
import { ShareImageViewer } from './ShareImageViewer'

export interface ShareImageButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Builds the image spec when clicked, so heavy drawing data is only gathered on demand */
  getImage: () => ShareImageSpec | Promise<ShareImageSpec>
  filename: string
  shareTitle?: string
  /** Alt text of the preview */
  imageAlt?: string
  onExported?: (outcome: ShareImageOutcome) => void
}

/** Renders a canvas share image and shows it in a viewer with save, copy and share actions */
export const ShareImageButton: FC<ShareImageButtonProps> = ({
  getImage,
  filename,
  shareTitle,
  imageAlt,
  onExported,
  children,
  disabled,
  ...buttonProps
}) => {
  const { t } = useTranslation(['share'])
  const [busy, setBusy] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [open, setOpen] = useState(false)

  const handleClick = async () => {
    setBusy(true)
    try {
      setBlob(await renderShareImage(await getImage()))
      setOpen(true)
      onExported?.('viewed')
    } catch (error) {
      console.error(error)
      toast.error(t('share:image.failed'))
      onExported?.('failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={
          busy ? <CircularProgress size="1rem" color="inherit" aria-hidden="true" /> : <MdiImage aria-hidden="true" />
        }
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        aria-haspopup="dialog"
        onClick={() => void handleClick()}
        {...buttonProps}
      >
        {children ?? t('share:image.button')}
      </Button>
      {blob && (
        <ShareImageViewer
          open={open}
          onClose={() => setOpen(false)}
          blob={blob}
          filename={filename}
          shareTitle={shareTitle}
          title={shareTitle}
          alt={imageAlt ?? shareTitle ?? t('share:image.viewer-title')}
          onOutcome={onExported}
        />
      )}
    </>
  )
}