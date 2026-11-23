import { Alert, Button, CircularProgress, TextField } from '@mui/material'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useAsyncFn, useEffectOnce as useMountEffect } from 'react-use'
import IconCheck from '~icons/material-symbols/check-circle-outline'
import IconError from '~icons/material-symbols/error-outline'
import { PasswordVisibilityAdornment } from '@/components/auth/PasswordVisibilityAdornment'
import { hasErrorCode, readResetLink } from '@/components/auth/authLinks'
import { useLocale } from '@/i18n/LocaleProvider'
import { authClient } from '@/lib/auth-client'
import { m } from '@/paraglide/messages'
import { formatErrorMessage } from '@/utils/formatErrorMessage'
import { buildPageTitleMeta } from '@/utils/pageTitleSeo'
import { resolveSeoLocale } from '@/utils/seo'

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128

export const Route = createFileRoute('/account/reset-password')({
  // The token is in the URL; read it on the client only, and keep the page out of every cache and index
  ssr: false,
  head: ({ match, matches }) => ({
    meta: [
      ...buildPageTitleMeta(resolveSeoLocale([match, ...matches]), 'auth:reset-password.title'),
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ResetPasswordPage,
})

type Phase = 'form' | 'done' | 'invalid'

function ResetPasswordPage() {
  const locale = useLocale()
  const navigate = useNavigate()
  // Client-only route (ssr: false): reading the URL in the first render cannot mismatch
  const [link] = useState(() => readResetLink(window.location.search))
  // Keep the one-time token out of the address bar, history and anything that reads the URL later
  useMountEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname)
  })
  const [phase, setPhase] = useState<Phase>(link.status === 'ready' ? 'form' : 'invalid')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visible, setVisible] = useState({ new: false, confirm: false })
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const newRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const newMissing = attempted && newPassword.length === 0
  const newLengthError =
    attempted && newPassword.length > 0
      ? newPassword.length < PASSWORD_MIN_LENGTH
        ? m.auth_form_validation_passwordMinLength({}, { locale })
        : newPassword.length > PASSWORD_MAX_LENGTH
          ? m.auth_form_validation_passwordMaxLength({}, { locale })
          : undefined
      : undefined
  const confirmMissing = attempted && confirmPassword.length === 0
  const newValid = newPassword.length >= PASSWORD_MIN_LENGTH && newPassword.length <= PASSWORD_MAX_LENGTH
  const canSubmit = newValid && confirmPassword.length > 0 && !mismatch

  const [submitState, submit] = useAsyncFn(async () => {
    if (link.status !== 'ready') return
    setError(null)
    const { error } = await authClient.resetPassword({ newPassword, token: link.token })
    if (!error) {
      setPhase('done')
      return
    }
    if (hasErrorCode(error, 'INVALID_TOKEN')) {
      setPhase('invalid')
      return
    }
    // A password found in a breach (haveIBeenPwned) or too short, in the page's language from the backend
    setError(formatErrorMessage(error, m.auth_form_errorGeneric({}, { locale })))
  }, [link, newPassword, locale])

  const toSignIn = () => navigate({ to: '/account/security' })
  const titleId = 'reset-password-title'
  const newPasswordId = 'reset-password-new'
  const confirmPasswordId = 'reset-password-confirm'

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
      <section aria-labelledby={titleId} className="glass flex w-full max-w-md flex-col gap-4 p-6 sm:p-8">
        {phase === 'form' ? (
          <>
            <div className="flex flex-col gap-1">
              <h1 id={titleId} className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
                {m.auth_resetPassword_title({}, { locale })}
              </h1>
              <p className="m-0 text-sm leading-normal text-fg-2 text-pretty">
                {m.auth_resetPassword_description({}, { locale })}
              </p>
            </div>
            {error && <Alert severity="error">{error}</Alert>}
            <form
              aria-labelledby={titleId}
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                if (submitState.loading) return
                if (!canSubmit) {
                  setAttempted(true)
                  if (!newValid) newRef.current?.focus()
                  else confirmRef.current?.focus()
                  return
                }
                void submit()
              }}
            >
              <TextField
                id={newPasswordId}
                name="new-password"
                label={m.auth_userProfile_password_new({}, { locale })}
                type={visible.new ? 'text' : 'password'}
                inputRef={newRef}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                error={newMissing || !!newLengthError}
                helperText={
                  newMissing
                    ? m.auth_userProfile_password_newRequired({}, { locale })
                    : (newLengthError ?? m.auth_form_passwordHint({}, { locale }))
                }
                size="small"
                fullWidth
                autoComplete="new-password"
                required
                inputProps={{ passwordrules: `minlength: ${PASSWORD_MIN_LENGTH};`, maxLength: PASSWORD_MAX_LENGTH }}
                InputProps={{
                  endAdornment: (
                    <PasswordVisibilityAdornment
                      visible={visible.new}
                      fieldLabel={m.auth_userProfile_password_new({}, { locale })}
                      inputId={newPasswordId}
                      onToggle={() => setVisible((current) => ({ ...current, new: !current.new }))}
                    />
                  ),
                }}
              />
              <TextField
                id={confirmPasswordId}
                name="confirm-password"
                label={m.auth_userProfile_password_confirm({}, { locale })}
                type={visible.confirm ? 'text' : 'password'}
                inputRef={confirmRef}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                error={mismatch || confirmMissing}
                helperText={
                  mismatch
                    ? m.auth_userProfile_password_mismatch({}, { locale })
                    : confirmMissing
                      ? m.auth_userProfile_password_confirmRequired({}, { locale })
                      : undefined
                }
                size="small"
                fullWidth
                autoComplete="new-password"
                required
                InputProps={{
                  endAdornment: (
                    <PasswordVisibilityAdornment
                      visible={visible.confirm}
                      fieldLabel={m.auth_userProfile_password_confirm({}, { locale })}
                      inputId={confirmPasswordId}
                      onToggle={() => setVisible((current) => ({ ...current, confirm: !current.confirm }))}
                    />
                  ),
                }}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={submitState.loading}
                aria-busy={submitState.loading || undefined}
                className="!py-2.5"
                fullWidth
              >
                {submitState.loading ? (
                  <CircularProgress size={20} color="inherit" aria-label={m.auth_form_pending({}, { locale })} />
                ) : (
                  m.auth_resetPassword_submit({}, { locale })
                )}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            {phase === 'done' ? (
              <IconCheck aria-hidden="true" className="size-12 text-status-positive" />
            ) : (
              <IconError aria-hidden="true" className="size-12 text-danger" />
            )}
            <h1 id={titleId} className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
              {phase === 'done'
                ? m.auth_resetPassword_successTitle({}, { locale })
                : m.auth_resetPassword_invalidTitle({}, { locale })}
            </h1>
            <p className="m-0 text-base leading-normal text-fg-2 text-pretty">
              {phase === 'done'
                ? m.auth_resetPassword_successBody({}, { locale })
                : m.auth_resetPassword_invalidBody({}, { locale })}
            </p>
            <Button variant="contained" onClick={toSignIn} className="!mt-2">
              {m.auth_resetPassword_signIn({}, { locale })}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}