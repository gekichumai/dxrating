import { DXVersionToDXDataVersionEnumMap } from '@/models/context/AppContext'
import { useAppContext } from '@/models/context/useAppContext'
import { Button, IconButton } from '@mui/material'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiClose from '~icons/mdi/close'
import { startViewTransition } from '@/utils/startViewTransition'

// A non-modal banner rather than a dialog: it never blocks the page on load, and only an explicit choice persists.
// "Keep" remembers the decision for this release; the close button only hides it for this visit.
export function RegionVersionUpdatePrompt() {
  const { t } = useTranslation(['settings'])
  const { version, region, availableVersionUpdate, dismissVersionUpdate, setVersionAndRegion } = useAppContext()
  const [hiddenForVisit, setHiddenForVisit] = useState(false)
  const titleId = useId()
  if (!availableVersionUpdate || hiddenForVisit) return null

  const current = DXVersionToDXDataVersionEnumMap[version]
  const latest = DXVersionToDXDataVersionEnumMap[availableVersionUpdate]
  return (
    <section
      aria-labelledby={titleId}
      className="glass-overlay fixed z-[1100] bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 right-4 md:right-auto md:w-[26rem] p-4 pe-2 shadow-[var(--shadow-overlay)]"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h2 id={titleId} className="m-0 text-base font-semibold leading-snug text-fg-1 text-balance">
            {t('settings:version-update.title')}
          </h2>
          <p className="m-0 text-sm text-fg-2 text-pretty">
            {t('settings:version-update.description', {
              region: t(`settings:region.${region}`),
              current,
              latest,
            })}
          </p>
        </div>
        <IconButton
          size="small"
          onClick={() => setHiddenForVisit(true)}
          aria-label={t('settings:version-update.later')}
          title={t('settings:version-update.later')}
          className="!-mt-1 !shrink-0 !text-fg-2"
        >
          <IconMdiClose aria-hidden="true" />
        </IconButton>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2 pe-2">
        <Button onClick={dismissVersionUpdate} color="inherit">
          {t('settings:version-update.keep', { current })}
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            void startViewTransition(() => setVersionAndRegion(availableVersionUpdate, region))
          }}
        >
          {t('settings:version-update.confirm', { latest })}
        </Button>
      </div>
    </section>
  )
}