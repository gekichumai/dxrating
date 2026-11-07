import { Button, IconButton } from '@mui/material'
import { type FC, useRef, useState } from 'react'
import IconMdiClose from '~icons/mdi/close'
import IconMdiCloudUploadOutline from '~icons/mdi/cloud-upload-outline'
import { focusMigrationReturnTarget, useCloudMigrationOffer } from '@/models/scores/CloudMigrationContext'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'

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
  const locale = useLocale()
  const offer = useCloudMigrationOffer()
  const [dismissed, setDismissed] = useState(readDismissed)
  const sectionRef = useRef<HTMLElement>(null)
  if (!offer.available || dismissed) return null

  const dismiss = () => {
    // The close button goes with the prompt: the focus moves to a control nearby (the Import menu) first
    focusMigrationReturnTarget(sectionRef.current?.parentElement ?? null)
    setDismissed(true)
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // For this page only
    }
  }

  return (
    // The question takes the first row and the button the second, the close button stays top-end: the records panel
    // is a narrow sidebar on desktop too, so one row would squeeze the question
    <section
      ref={sectionRef}
      className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 glass-inset px-3 py-2"
      aria-label={m.ratingCalculator_cloudSave_migration_title({}, { locale })}
    >
      <IconMdiCloudUploadOutline className="size-5 shrink-0 text-fg-2" aria-hidden />
      <p className="m-0 min-w-0 text-sm text-fg-1 text-pretty">
        {m.ratingCalculator_cloudSave_migration_prompt(
          {
            count: offer.localCount,
            formatted: new Intl.NumberFormat(locale).format(offer.localCount),
          },
          { locale },
        )}
      </p>
      <div className="col-span-3 col-start-1 row-start-2 flex justify-end">
        <Button size="small" variant="contained" onClick={offer.open}>
          {m.ratingCalculator_cloudSave_migration_backUp({}, { locale })}
        </Button>
      </div>
      <IconButton
        size="small"
        onClick={dismiss}
        aria-label={m.ratingCalculator_cloudSave_migration_notNow({}, { locale })}
        className="col-start-3 row-start-1"
      >
        <IconMdiClose className="size-4" aria-hidden />
      </IconButton>
    </section>
  )
}