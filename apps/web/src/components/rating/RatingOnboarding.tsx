import { Button } from '@mui/material'
import type { FC, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiCloudDownloadOutline from '~icons/mdi/cloud-download-outline'
import IconMdiConnection from '~icons/mdi/connection'
import IconMdiPlaylistPlus from '~icons/mdi/playlist-plus'
import { ImportMenu } from './io/ImportMenu'
import { useNetImportSettings } from './io/import/NetImportSettingsContext'
import { captureAnalyticsEvent } from '../../lib/analytics'

/** The id of the add-entry form's wrapper; "Add a chart" moves focus to the chart field inside it */
export const RATING_ADD_ENTRY_ID = 'rating-add-entry'

const OnboardingStep: FC<{
  icon: ReactNode
  title: string
  description: string
  action: ReactNode
  recommended?: boolean
}> = ({ icon, title, description, action, recommended }) => (
  <li className="rating-onboarding-step glass-inset" data-recommended={recommended || undefined}>
    <span className="rating-onboarding-step-icon" aria-hidden>
      {icon}
    </span>
    <div className="flex flex-col gap-1 min-w-0">
      <h3 className="m-0 text-sm font-semibold leading-snug text-fg-1">{title}</h3>
      <p className="m-0 text-sm leading-normal text-fg-2 text-pretty">{description}</p>
    </div>
    <div className="rating-onboarding-step-action">{action}</div>
  </li>
)

/**
 * What /rating shows before the visitor has any record: what the page does, then the ways to get scores in, best
 * first. The calculator renders in the browser only (ClientOnly), so none of this reaches the server render.
 */
export const RatingOnboarding: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const { openSettings } = useNetImportSettings()

  const focusChartField = () => {
    const input = document.querySelector<HTMLInputElement>(`#${RATING_ADD_ENTRY_ID} input`)
    if (!input) return
    input.scrollIntoView({ block: 'center', behavior: 'smooth' })
    input.focus({ preventScroll: true })
  }

  return (
    <section className="glass rating-onboarding" aria-labelledby="rating-onboarding-title">
      <div className="flex flex-col gap-2">
        <h2 id="rating-onboarding-title" className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
          {t('rating-calculator:empty.title')}
        </h2>
        <p className="m-0 text-sm sm:text-base leading-relaxed text-fg-2 text-pretty max-w-[65ch]">
          {t('rating-calculator:empty.description')}
        </p>
      </div>

      <ol className="rating-onboarding-steps">
        <OnboardingStep
          recommended
          icon={<IconMdiConnection />}
          title={t('rating-calculator:empty.net.title')}
          description={t('rating-calculator:empty.net.description')}
          action={
            <Button
              variant="contained"
              aria-haspopup="dialog"
              onClick={(event) => {
                captureAnalyticsEvent('rating_onboarding_action_clicked', { action: 'maimai_net' })
                openSettings(event.currentTarget)
              }}
            >
              {t('rating-calculator:empty.net.button')}
            </Button>
          }
        />
        <OnboardingStep
          icon={<IconMdiCloudDownloadOutline />}
          title={t('rating-calculator:empty.other.title')}
          description={t('rating-calculator:empty.other.description')}
          action={<ImportMenu label={t('rating-calculator:empty.other.button')} />}
        />
        <OnboardingStep
          icon={<IconMdiPlaylistPlus />}
          title={t('rating-calculator:empty.manual.title')}
          description={t('rating-calculator:empty.manual.description')}
          action={
            <Button
              variant="text"
              onClick={() => {
                captureAnalyticsEvent('rating_onboarding_action_clicked', { action: 'manual' })
                focusChartField()
              }}
            >
              {t('rating-calculator:empty.manual.button')}
            </Button>
          }
        />
      </ol>
    </section>
  )
}