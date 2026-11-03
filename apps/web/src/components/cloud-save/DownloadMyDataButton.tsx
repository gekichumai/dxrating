import { Button } from '@mui/material'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import IconMdiDownload from '~icons/mdi/download'
import { saveBlobAsFile, useCloudSaveActions } from '@/models/scores/cloudSaveActions'

const isRateLimited = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (('status' in error && error.status === 429) || ('code' in error && error.code === 'TOO_MANY_REQUESTS'))

/** "Download my data" (§11.3): every cloud save, with provenance, import jobs, events and snapshots, as JSON */
export const DownloadMyDataButton: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const actions = useCloudSaveActions()
  const [busy, setBusy] = useState(false)

  const download = async () => {
    // Stays focusable while busy (aria-disabled): a second press does nothing
    if (busy) return
    setBusy(true)
    try {
      const { blob, fileName } = await actions.exportData()
      saveBlobAsFile(blob, fileName)
      toast.success(t('rating-calculator:cloud-save.export.success'), {
        id: 'cloud-export',
      })
    } catch (error) {
      toast.error(
        isRateLimited(error)
          ? t('rating-calculator:cloud-save.export.rate-limited')
          : t('rating-calculator:cloud-save.export.error'),
        { id: 'cloud-export' },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="small"
        variant="outlined"
        startIcon={<IconMdiDownload aria-hidden />}
        onClick={() => void download()}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        className={busy ? 'cursor-progress opacity-60' : undefined}
      >
        {busy ? t('rating-calculator:cloud-save.export.preparing') : t('rating-calculator:cloud-save.export.button')}
      </Button>
      {/* Read out while the button keeps the focus */}
      <output className="sr-only">{busy ? t('rating-calculator:cloud-save.export.preparing') : ''}</output>
    </div>
  )
}