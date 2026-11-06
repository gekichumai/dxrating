import { Button, type ButtonProps, CircularProgress } from '@mui/material'
import { type FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import MdiShareVariant from '~icons/mdi/share-variant'
import type { ShareImageOutcome } from '@/lib/analytics'
import { renderShareImage, type ShareImageSpec, shareOrDownloadImage } from '@/utils/shareImage/shareImage'

export interface ShareImageButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Builds the image spec when clicked, so heavy drawing data is only gathered on demand */
  getImage: () => ShareImageSpec | Promise<ShareImageSpec>
  filename: string
  shareTitle?: string
  onExported?: (outcome: ShareImageOutcome) => void
}

/** Renders a canvas share image and opens the share sheet, or downloads the PNG where sharing files is unsupported */
export const ShareImageButton: FC<ShareImageButtonProps> = ({
  getImage,
  filename,
  shareTitle,
  onExported,
  children,
  disabled,
  ...buttonProps
}) => {
  const { t } = useTranslation(['share'])
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    setBusy(true)
    try {
      const blob = await renderShareImage(await getImage())
      const outcome = await shareOrDownloadImage(blob, filename, shareTitle)
      if (outcome === 'downloaded') toast.success(t('share:image.downloaded'))
      onExported?.(outcome)
    } catch (error) {
      console.error(error)
      toast.error(t('share:image.failed'))
      onExported?.('failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="outlined"
      startIcon={
        busy ? (
          <CircularProgress size="1rem" color="inherit" aria-hidden="true" />
        ) : (
          <MdiShareVariant aria-hidden="true" />
        )
      }
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={() => void handleClick()}
      {...buttonProps}
    >
      {children ?? t('share:image.button')}
    </Button>
  )
}