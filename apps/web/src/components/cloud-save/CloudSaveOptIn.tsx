import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Switch } from '@mui/material'
import { type FC, type ReactNode, useId, useState } from 'react'
import toast from 'react-hot-toast'
import { Trans, useTranslation } from 'react-i18next'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useActiveSave } from '@/models/scores/ActiveSaveContext'
import { CLOUD_SAVE_CONSENT_VERSION, useCloudSaveActions } from '@/models/scores/cloudSaveActions'
import './cloud-save.css'

/** The privacy policy, in a new tab so the consent stays open; its text comes from the translation */
const PrivacyPolicyLink: FC<{ children?: ReactNode }> = ({ children }) => (
  <a href="/privacy-policy" target="_blank" rel="noopener" className="text-inherit underline">
    {children}
  </a>
)

/**
 * The consent text of the cloud save beta (§11.2): what is stored, for how long, that SEGA passwords never are, and
 * the privacy policy. There is no way to leave the beta from the app yet, and the text says so instead of offering
 * a switch that cannot turn it off.
 */
export const CloudSaveConsentDialog: FC<{
  open: boolean
  busy?: boolean
  onCancel(): void
  onAgree(): void
}> = ({ open, busy, onCancel, onAgree }) => {
  const { t } = useTranslation(['rating-calculator'])
  const titleId = useId()
  const points = ['stored', 'retention', 'passwords', 'leaving'] as const
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      PaperProps={{ className: 'cloud-save-surface', sx: { borderRadius: '0.75rem' } }}
    >
      <DialogTitle id={titleId} className="text-pretty">
        {t('rating-calculator:cloud-save.opt-in.consent-title')}
      </DialogTitle>
      <DialogContent className="flex flex-col gap-3">
        <p className="m-0 text-sm text-zinc-700 text-pretty">
          {t('rating-calculator:cloud-save.opt-in.consent-intro')}
        </p>
        <ul className="m-0 flex flex-col gap-2 ps-5 text-sm text-zinc-700">
          {points.map((point) => (
            <li key={point} className="text-pretty">
              {t(`rating-calculator:cloud-save.opt-in.consent-${point}`)}
            </li>
          ))}
        </ul>
        <p className="m-0 text-xs text-zinc-600 text-pretty">
          <Trans
            i18nKey="rating-calculator:cloud-save.opt-in.consent-privacy"
            components={{
              privacy: <PrivacyPolicyLink />,
            }}
          />
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          {t('rating-calculator:cloud-save.import-confirm.cancel')}
        </Button>
        <Button variant="contained" onClick={onAgree} disabled={busy} aria-busy={busy || undefined}>
          {t('rating-calculator:cloud-save.opt-in.agree')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * "Cloud save (beta)" in the account menu (§12.2 stage 3), while the server offers the opt-in
 * (`/me/features.optInAvailable`). Turning it on shows the consent text; agreeing records the consent
 * (`POST /me/features/cloud-save/opt-in`), then the features are read again and the cloud save surfaces appear.
 */
export const CloudSaveOptIn: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const activeSave = useActiveSave()
  const actions = useCloudSaveActions()
  const [consentOpen, setConsentOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const switchId = useId()
  const descriptionId = useId()
  if (!activeSave.features?.optInAvailable) return null

  const agree = async () => {
    setBusy(true)
    try {
      await actions.optIn(CLOUD_SAVE_CONSENT_VERSION)
      captureAnalyticsEvent('cloudsave_enabled', { via: 'opt_in' })
      setConsentOpen(false)
      toast.success(t('rating-calculator:cloud-save.opt-in.success'), { id: 'cloud-save-opt-in' })
      // The cached features say "off": read them again, which shows the cloud save surfaces
      activeSave.refreshFeatures()
    } catch {
      toast.error(t('rating-calculator:cloud-save.opt-in.error'), { id: 'cloud-save-opt-in' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-lg bg-zinc-900/4 p-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={switchId} className="block cursor-pointer text-sm font-semibold text-zinc-900">
          {t('rating-calculator:cloud-save.opt-in.title')}
        </label>
        <p id={descriptionId} className="m-0 mt-0.5 text-xs text-zinc-600 text-pretty">
          {t('rating-calculator:cloud-save.opt-in.description')}
        </p>
      </div>
      <Switch
        id={switchId}
        checked={false}
        onChange={() => setConsentOpen(true)}
        inputProps={{ role: 'switch', 'aria-describedby': descriptionId }}
      />
      <CloudSaveConsentDialog
        open={consentOpen}
        busy={busy}
        onCancel={() => setConsentOpen(false)}
        onAgree={() => void agree()}
      />
    </div>
  )
}