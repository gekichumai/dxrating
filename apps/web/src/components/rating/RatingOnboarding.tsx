import { Button } from '@mui/material'
import type { FC, ReactNode } from 'react'
import IconMdiCloudDownloadOutline from '~icons/mdi/cloud-download-outline'
import IconMdiConnection from '~icons/mdi/connection'
import IconMdiPlaylistPlus from '~icons/mdi/playlist-plus'
import { ImportMenu } from './io/ImportMenu'
import { useNetImportSettings } from './io/import/NetImportSettingsContext'
import { captureAnalyticsEvent } from '../../lib/analytics'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

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
  const locale = useLocale()
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
          {m.ratingCalculator_empty_title({}, { locale })}
        </h2>
        <p className="m-0 text-sm sm:text-base leading-relaxed text-fg-2 text-pretty max-w-[65ch]">
          {m.ratingCalculator_empty_description({}, { locale })}
        </p>
      </div>

      <ol className="rating-onboarding-steps">
        <OnboardingStep
          recommended
          icon={<IconMdiConnection />}
          title={m.ratingCalculator_empty_net_title({}, { locale })}
          description={m.ratingCalculator_empty_net_description({}, { locale })}
          action={
            <Button
              variant="contained"
              aria-haspopup="dialog"
              onClick={(event) => {
                captureAnalyticsEvent('rating_onboarding_action_clicked', { action: 'maimai_net' })
                openSettings(event.currentTarget)
              }}
            >
              {m.ratingCalculator_empty_net_button({}, { locale })}
            </Button>
          }
        />
        <OnboardingStep
          icon={<IconMdiCloudDownloadOutline />}
          title={m.ratingCalculator_empty_other_title({}, { locale })}
          description={m.ratingCalculator_empty_other_description({}, { locale })}
          action={<ImportMenu label={m.ratingCalculator_empty_other_button({}, { locale })} />}
        />
        <OnboardingStep
          icon={<IconMdiPlaylistPlus />}
          title={m.ratingCalculator_empty_manual_title({}, { locale })}
          description={m.ratingCalculator_empty_manual_description({}, { locale })}
          action={
            <Button
              variant="text"
              onClick={() => {
                captureAnalyticsEvent('rating_onboarding_action_clicked', { action: 'manual' })
                focusChartField()
              }}
            >
              {m.ratingCalculator_empty_manual_button({}, { locale })}
            </Button>
          }
        />
      </ol>
    </section>
  )
}