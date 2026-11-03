import { Button, IconButton } from '@mui/material'
import { type FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiClose from '~icons/mdi/close'
import IconMdiCloudUploadOutline from '~icons/mdi/cloud-upload-outline'
import { useCloudMigrationOffer } from '@/models/scores/CloudMigrationContext'

const DISMISSED_KEY = 'dxr-cloud-migration-prompt-dismissed'

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The rating calculator's offer to back the local save up to the cloud (§10). Only an offer: the migration starts
 * when the user clicks. "Not now" hides it for this browser session; the account menu keeps the button. Renders
 * nothing unless the offer is available (signed in, cloud save on, a local save, no cloud save chosen).
 */
export const CloudMigrationPrompt: FC = () => {
  const { t, i18n } = useTranslation(['rating-calculator'])
  const offer = useCloudMigrationOffer()
  const [dismissed, setDismissed] = useState(readDismissed)
  if (!offer.available || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // For this page only
    }
  }

  return (
    <section
      className="mt-3 flex items-center gap-3 rounded-lg bg-white/50 px-3 py-2 ring-1 ring-inset ring-zinc-900/8"
      aria-label={t('rating-calculator:cloud-save.migration.title')}
    >
      <IconMdiCloudUploadOutline className="size-5 shrink-0 text-zinc-700" aria-hidden />
      <p className="m-0 min-w-0 flex-1 text-sm text-zinc-800 text-pretty">
        {t('rating-calculator:cloud-save.migration.prompt', {
          count: offer.localCount,
          formatted: new Intl.NumberFormat(i18n.language).format(offer.localCount),
        })}
      </p>
      <Button size="small" variant="contained" className="shrink-0" onClick={offer.open}>
        {t('rating-calculator:cloud-save.migration.back-up')}
      </Button>
      <IconButton size="small" onClick={dismiss} aria-label={t('rating-calculator:cloud-save.migration.not-now')}>
        <IconMdiClose className="size-4" aria-hidden />
      </IconButton>
    </section>
  )
}