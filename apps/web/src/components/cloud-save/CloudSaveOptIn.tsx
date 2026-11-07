import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Switch } from '@mui/material'
import { type FC, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ParaglideMessage } from '@inlang/paraglide-js-react'
import type { PlainMessage } from '@/i18n/message'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useActiveSave } from '@/models/scores/ActiveSaveContext'
import { focusMigrationReturnTarget } from '@/models/scores/CloudMigrationContext'
import { MigrationCancelledError } from '@/models/scores/cloudMigration'
import { CLOUD_SAVE_CONSENT_VERSION, useCloudSaveActions } from '@/models/scores/cloudSaveActions'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'
import './cloud-save.css'

/** The privacy policy, in a new tab so the consent stays open; its text comes from the translation */
const PrivacyPolicyLink: FC<{ children?: ReactNode }> = ({ children }) => {
  // In the consent's language: a `?locale=` the page was opened with sets no cookie, so the new tab would not know it
  const locale = useLocale()
  return (
    <a
      href={`/privacy-policy?locale=${encodeURIComponent(locale)}#privacy-cloud`}
      target="_blank"
      rel="noopener"
      className="link"
    >
      {children}
    </a>
  )
}

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
  const locale = useLocale()
  const titleId = useId()
  const points: { key: string; message: PlainMessage }[] = [
    { key: 'stored', message: m.ratingCalculator_cloudSave_optIn_consentStored },
    { key: 'retention', message: m.ratingCalculator_cloudSave_optIn_consentRetention },
    { key: 'passwords', message: m.ratingCalculator_cloudSave_optIn_consentPasswords },
    { key: 'leaving', message: m.ratingCalculator_cloudSave_optIn_consentLeaving },
  ]
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      PaperProps={{
        className: 'cloud-save-surface',
        sx: { borderRadius: '0.75rem' },
      }}
    >
      <DialogTitle id={titleId} className="text-pretty">
        {m.ratingCalculator_cloudSave_optIn_consentTitle({}, { locale })}
      </DialogTitle>
      <DialogContent className="flex flex-col gap-3">
        <p className="m-0 text-sm text-fg-2 text-pretty">
          {m.ratingCalculator_cloudSave_optIn_consentIntro({}, { locale })}
        </p>
        <ul className="m-0 flex flex-col gap-2 ps-5 text-sm text-fg-2">
          {points.map((point) => (
            <li key={point.key} className="text-pretty">
              {point.message({}, { locale })}
            </li>
          ))}
        </ul>
        <p className="m-0 text-xs text-fg-2 text-pretty">
          <ParaglideMessage
            message={m.ratingCalculator_cloudSave_optIn_consentPrivacy}
            inputs={{}}
            options={{ locale }}
            markup={{ privacy: ({ children }) => <PrivacyPolicyLink>{children}</PrivacyPolicyLink> }}
          />
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          {m.ratingCalculator_cloudSave_importConfirm_cancel({}, { locale })}
        </Button>
        {/* Stays focusable while the consent is sent (aria-disabled): a second press does nothing */}
        <Button
          variant="contained"
          onClick={busy ? undefined : onAgree}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          className={busy ? 'cursor-progress opacity-60' : undefined}
        >
          {m.ratingCalculator_cloudSave_optIn_agree({}, { locale })}
        </Button>
        <output className="sr-only">{busy ? m.ratingCalculator_cloudSave_optIn_sending({}, { locale }) : ''}</output>
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
  const locale = useLocale()
  const activeSave = useActiveSave()
  const actions = useCloudSaveActions()
  const [consentOpen, setConsentOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const switchId = useId()
  const descriptionId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  // Set by a successful opt-in: where the switch was, for the focus once the switch goes
  const focusScopeAfterOptIn = useRef<Element | null | undefined>(undefined)
  const optInAvailable = activeSave.features?.optInAvailable === true
  const userId = activeSave.userId
  // The consent being sent, for the account that gave it: stopped when that account goes or the switch unmounts
  const pending = useRef<AbortController | null>(null)

  // Another account (or none) now: the consent given so far was not theirs
  useEffect(() => {
    setConsentOpen(false)
    return () => {
      pending.current?.abort()
      pending.current = null
    }
  }, [userId])

  // The features read again after the opt-in no longer offer it, and the switch (which had the focus back from the
  // consent dialog) goes with it: the focus moves to the section's heading, which stays, instead of the page
  useEffect(() => {
    const scope = focusScopeAfterOptIn.current
    if (optInAvailable || scope === undefined) return
    focusScopeAfterOptIn.current = undefined
    // Unless the user already moved it somewhere that stays
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    focusMigrationReturnTarget(scope)
  }, [optInAvailable])

  if (!optInAvailable) return null

  const agree = async () => {
    if (!userId) return
    const controller = new AbortController()
    pending.current?.abort()
    pending.current = controller
    const { signal } = controller
    const beforeSend = async () => {
      if (signal.aborted) throw new MigrationCancelledError()
      // Asked of the server: another tab may have signed another account in on this browser
      const current = await actions.migration.currentUserId?.()
      if (signal.aborted || (current !== undefined && current !== userId)) throw new MigrationCancelledError()
    }
    setBusy(true)
    try {
      await actions.optIn(CLOUD_SAVE_CONSENT_VERSION, { signal, beforeSend })
      captureAnalyticsEvent('cloudsave_enabled', { via: 'opt_in' })
      setConsentOpen(false)
      focusScopeAfterOptIn.current = rootRef.current?.parentElement ?? null
      toast.success(m.ratingCalculator_cloudSave_optIn_success({}, { locale }), {
        id: 'cloud-save-opt-in',
      })
      // The cached features say "off": read them again, which shows the cloud save surfaces
      activeSave.refreshFeatures()
    } catch (error) {
      // The account that agreed is gone: nothing was sent, and nothing to say to the one here now
      if (error instanceof MigrationCancelledError || signal.aborted) {
        setConsentOpen(false)
        return
      }
      toast.error(m.ratingCalculator_cloudSave_optIn_error({}, { locale }), {
        id: 'cloud-save-opt-in',
      })
    } finally {
      if (pending.current === controller) pending.current = null
      setBusy(false)
    }
  }

  return (
    <div ref={rootRef} className="flex items-start gap-3 glass-inset p-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={switchId} className="block cursor-pointer text-sm font-semibold text-fg-1">
          {m.ratingCalculator_cloudSave_optIn_title({}, { locale })}
        </label>
        <p id={descriptionId} className="m-0 mt-0.5 text-xs text-fg-2 text-pretty">
          {m.ratingCalculator_cloudSave_optIn_description({}, { locale })}
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