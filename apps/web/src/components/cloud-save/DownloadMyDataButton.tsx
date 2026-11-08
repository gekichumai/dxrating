import { Button } from '@mui/material'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import IconMdiDownload from '~icons/mdi/download'
import { saveBlobAsFile, useCloudSaveActions } from '@/models/scores/cloudSaveActions'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'

const isRateLimited = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (('status' in error && error.status === 429) || ('code' in error && error.code === 'TOO_MANY_REQUESTS'))

/** "Download my data" (§11.3): every cloud save, with provenance, import jobs, events and snapshots, as JSON */
export const DownloadMyDataButton: FC = () => {
  const locale = useLocale()
  const actions = useCloudSaveActions()
  const [busy, setBusy] = useState(false)

  const download = async () => {
    // Stays focusable while busy (aria-disabled): a second press does nothing
    if (busy) return
    setBusy(true)
    try {
      const { blob, fileName } = await actions.exportData()
      saveBlobAsFile(blob, fileName)
      toast.success(m.ratingCalculator_cloudSave_export_success({}, { locale }), {
        id: 'cloud-export',
      })
    } catch (error) {
      toast.error(
        isRateLimited(error)
          ? m.ratingCalculator_cloudSave_export_rateLimited({}, { locale })
          : m.ratingCalculator_cloudSave_export_error({}, { locale }),
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
        {busy
          ? m.ratingCalculator_cloudSave_export_preparing({}, { locale })
          : m.ratingCalculator_cloudSave_export_button({}, { locale })}
      </Button>
      {/* Read out while the button keeps the focus */}
      <output className="sr-only">{busy ? m.ratingCalculator_cloudSave_export_preparing({}, { locale }) : ''}</output>
    </div>
  )
}