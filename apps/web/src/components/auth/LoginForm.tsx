import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useResolvedTheme } from '@/utils/useResolvedTheme'
import { Alert, Button, Chip, CircularProgress, Divider, TextField, useMediaQuery } from '@mui/material'
import clsx from 'clsx'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useEffectOnce as useMountEffect } from 'react-use'
import { useWebHaptics } from 'web-haptics/react'
import IconLogosGithub from '~icons/logos/github-icon'
import IconLogosGoogle from '~icons/logos/google-icon'
import IconPasskey from '~icons/material-symbols/passkey'
import { authClient } from '../../lib/auth-client'
import { formatErrorMessage } from '../../utils/formatErrorMessage'
import { PasswordVisibilityAdornment } from './PasswordVisibilityAdornment'
import { useLocale } from '@/i18n/LocaleProvider'
import { ParaglideMessage } from '@inlang/paraglide-js-react'
import { m } from '@/paraglide/messages'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

interface LoginFormValues {
  email: string
  password: string
}

type AuthProvider = 'google' | 'github' | 'passkey' | 'email'

/** Id of the form's heading, stable across sign-in and sign-up, so a dialog around the form can take it as its name */
export const loginFormTitleId = (idPrefix: string) => `${idPrefix}-auth-form-title`

const LAST_USED_CHIP_CLASS = '!h-5 !text-xs !font-semibold'
// On the filled (last used) button, the chip inverts so it doesn't vanish into the same accent fill
const LAST_USED_BUTTON_CHIP_CLASS = `${LAST_USED_CHIP_CLASS} !bg-surface/90 !text-accent-strong`

export const LoginForm = ({
  idPrefix = 'auth',
  onPendingChange,
  onSuccess,
  hideTitleFromMd = false,
}: {
  idPrefix?: string
  onPendingChange?: (pending: boolean) => void
  onSuccess?: () => void
  /**
   * From md up, hides the sign-in heading visually but keeps it for screen readers (it still names the form), for a
   * page that sets its own heading beside the form at that width
   */
  hideTitleFromMd?: boolean
}) => {
  const locale = useLocale()
  const {
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
  } = useForm<LoginFormValues>({
    // Errors appear once a field is left or the form is submitted, not on the first keystroke
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  })
  const haptic = useWebHaptics()
  const [pendingProvider, setPendingProvider] = useState<AuthProvider | null>(null)
  const loading = pendingProvider !== null
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)
  const resolvedTheme = useResolvedTheme()
  const turnstileTheme = resolvedTheme ?? 'auto'
  // The flexible widget is at least 300px wide; below 360px viewports it would overflow the card, so use compact (150px)
  const turnstileCompact = useMediaQuery('(max-width: 359.98px)', { noSsr: true })
  const turnstileSize = turnstileCompact ? 'compact' : 'flexible'
  // A theme or size change recreates the Turnstile widget, and removing a widget fires no callback, so a token from the
  // old widget would outlive it (and its expiry). Drop it whenever the widget is replaced; submission waits for the
  // replacement to succeed.
  const turnstileWidgetKey = `${turnstileTheme}-${turnstileSize}`
  const [tokenWidgetKey, setTokenWidgetKey] = useState(turnstileWidgetKey)
  if (tokenWidgetKey !== turnstileWidgetKey) {
    setTokenWidgetKey(turnstileWidgetKey)
    setTurnstileToken(null)
  }
  const lastUsedMethod = authClient.getLastUsedLoginMethod() as AuthProvider | null
  const isLastUsed = (provider: AuthProvider) => lastUsedMethod === provider

  const setActiveProvider = (provider: AuthProvider | null) => {
    setPendingProvider(provider)
    onPendingChange?.(provider !== null)
  }

  const captchaHeaders = turnstileToken ? { 'x-captcha-response': turnstileToken } : undefined
  const waitingForTurnstile = !!TURNSTILE_SITE_KEY && !turnstileToken
  const buttonLoading = loading || (isValid && waitingForTurnstile)
  // Submit stays available so validation can run and focus the first invalid field; only a running request blocks it
  const buttonDisabled = loading

  const onSubmit = async (data: LoginFormValues) => {
    if (waitingForTurnstile) {
      setError(m.auth_form_captchaPending({}, { locale }))
      return
    }
    setActiveProvider('email')
    setError(null)
    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({
          email: data.email,
          password: data.password,
          name: data.email.split('@')[0], // Default name
          fetchOptions: captchaHeaders ? { headers: captchaHeaders } : undefined,
        })
        if (error) throw error
        haptic.trigger('success')
        toast.success(m.auth_signUp_toastSuccess({}, { locale }))
        setIsSignUp(false)
        setShowPassword(false)
      } else {
        const { error } = await authClient.signIn.email({
          email: data.email,
          password: data.password,
          fetchOptions: captchaHeaders ? { headers: captchaHeaders } : undefined,
        })
        if (error) throw error
        haptic.trigger('success')
        toast.success(m.auth_login_toastSuccess({}, { locale }))
        onSuccess?.()
      }
    } catch (e: unknown) {
      haptic.trigger('error')
      setError(formatErrorMessage(e, m.auth_form_errorGeneric({}, { locale })))
    } finally {
      setActiveProvider(null)
      turnstileRef.current?.reset()
      setTurnstileToken(null)
    }
  }

  const handleSocial = async (provider: 'google' | 'github') => {
    setActiveProvider(provider)
    await authClient.signIn.social({
      provider,
      callbackURL: window.location.href,
      errorCallbackURL: window.location.href,
    })
    // No setPendingProvider(null) because it redirects
  }

  const handlePasskey = async () => {
    setActiveProvider('passkey')
    setError(null)
    try {
      const { error } = await authClient.signIn.passkey()
      if (error) throw error
      haptic.trigger('success')
      toast.success(m.auth_login_toastSuccess({}, { locale }))
      onSuccess?.()
    } catch (e: unknown) {
      haptic.trigger('error')
      setError(formatErrorMessage(e, m.auth_form_errorPasskey({}, { locale })))
    } finally {
      setActiveProvider(null)
    }
  }

  const toggleView = () => {
    setIsSignUp(!isSignUp)
    setShowPassword(false)
    setError(null)
    turnstileRef.current?.reset()
    setTurnstileToken(null)
  }

  const formTitleId = loginFormTitleId(idPrefix)
  const emailId = `${idPrefix}-${isSignUp ? 'sign-up' : 'sign-in'}-email`
  const passwordId = `${idPrefix}-${isSignUp ? 'sign-up' : 'sign-in'}-password`

  return (
    <div className="w-full">
      <form
        aria-labelledby={formTitleId}
        className="flex flex-col gap-3"
        onSubmit={handleFormSubmit(onSubmit)}
        noValidate
      >
        {/* A switch to sign-up still shows its heading, since the page around the form only talks about signing in */}
        <div className={clsx('text-center mb-1', hideTitleFromMd && !isSignUp && 'md:sr-only')}>
          <h2 id={formTitleId} className="text-xl font-semibold leading-tight text-fg-1 m-0">
            {isSignUp ? m.auth_signUp_title({}, { locale }) : m.auth_form_title({}, { locale })}
          </h2>
          <p className="text-sm text-fg-2 mt-1 mb-0 text-pretty">
            {isSignUp ? m.auth_signUp_subtitle({}, { locale }) : m.auth_form_subtitle({}, { locale })}
          </p>
        </div>

        <p className="m-0 text-center text-xs leading-relaxed text-fg-2 text-pretty">
          <ParaglideMessage
            message={m.auth_terms_notice}
            inputs={{}}
            options={{ locale }}
            markup={{
              terms: ({ children }) => (
                <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="link">
                  {children}
                </a>
              ),
            }}
          />
        </p>
        {!isSignUp && <ConditionalPasskey onSuccess={onSuccess} />}

        {error && <Alert severity="error">{error}</Alert>}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant={isLastUsed('github') ? 'contained' : 'outlined'}
            startIcon={
              pendingProvider === 'github' ? (
                <CircularProgress size={20} />
              ) : (
                <IconLogosGithub className="w-5 h-5 dark:invert" />
              )
            }
            endIcon={
              isLastUsed('github') ? (
                <Chip
                  label={m.auth_form_lastUsed({}, { locale })}
                  size="small"
                  color="primary"
                  className={LAST_USED_BUTTON_CHIP_CLASS}
                />
              ) : undefined
            }
            onClick={() => handleSocial('github')}
            disabled={loading}
            className="!py-2.5 !text-sm"
            fullWidth
          >
            {m.auth_form_continueWithGithub({}, { locale })}
          </Button>
          <Button
            type="button"
            variant={isLastUsed('google') ? 'contained' : 'outlined'}
            startIcon={
              pendingProvider === 'google' ? <CircularProgress size={20} /> : <IconLogosGoogle className="w-5 h-5" />
            }
            endIcon={
              isLastUsed('google') ? (
                <Chip
                  label={m.auth_form_lastUsed({}, { locale })}
                  size="small"
                  color="primary"
                  className={LAST_USED_BUTTON_CHIP_CLASS}
                />
              ) : undefined
            }
            onClick={() => handleSocial('google')}
            disabled={loading}
            className="!py-2.5 !text-sm"
            fullWidth
          >
            {m.auth_form_continueWithGoogle({}, { locale })}
          </Button>
          {!isSignUp && (
            <Button
              type="button"
              variant={isLastUsed('passkey') ? 'contained' : 'outlined'}
              startIcon={
                pendingProvider === 'passkey' ? <CircularProgress size={20} /> : <IconPasskey className="size-5" />
              }
              endIcon={
                isLastUsed('passkey') ? (
                  <Chip
                    label={m.auth_form_lastUsed({}, { locale })}
                    size="small"
                    color="primary"
                    className={LAST_USED_BUTTON_CHIP_CLASS}
                  />
                ) : undefined
              }
              onClick={handlePasskey}
              disabled={loading}
              className="!py-2.5 !text-sm"
              fullWidth
            >
              {m.auth_form_signInWithPasskey({}, { locale })}
            </Button>
          )}
        </div>

        <Divider className="!my-1">
          {isLastUsed('email') ? (
            <Chip
              label={m.auth_form_lastUsed({}, { locale })}
              size="small"
              color="primary"
              className={LAST_USED_CHIP_CLASS}
            />
          ) : (
            <span className="text-xs text-fg-2">{m.auth_form_or({}, { locale })}</span>
          )}
        </Divider>

        <div className="flex flex-col gap-2">
          <TextField
            id={emailId}
            {...register('email', {
              required: m.auth_form_validation_emailRequired({}, { locale }),
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: m.auth_form_validation_emailInvalid({}, { locale }),
              },
            })}
            label={m.auth_form_email({}, { locale })}
            type="email"
            autoComplete={isSignUp ? 'email' : 'username webauthn'}
            required
            error={!!errors.email}
            helperText={errors.email?.message}
            disabled={loading}
            fullWidth
            size="small"
          />
          <TextField
            id={passwordId}
            {...register('password', {
              required: m.auth_form_validation_passwordRequired({}, { locale }),
              minLength: {
                value: 8,
                message: m.auth_form_validation_passwordMinLength({}, { locale }),
              },
            })}
            label={m.auth_form_password({}, { locale })}
            type={showPassword ? 'text' : 'password'}
            autoComplete={isSignUp ? 'new-password' : 'current-password webauthn'}
            required
            error={!!errors.password}
            helperText={errors.password?.message}
            disabled={loading}
            fullWidth
            size="small"
            InputProps={{
              endAdornment: (
                <PasswordVisibilityAdornment
                  visible={showPassword}
                  fieldLabel={m.auth_form_password({}, { locale })}
                  inputId={passwordId}
                  onToggle={() => setShowPassword((visible) => !visible)}
                />
              ),
            }}
          />
        </div>

        {TURNSTILE_SITE_KEY && (
          <Turnstile
            key={turnstileWidgetKey}
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={(token) => {
              setTurnstileToken(token)
              // The "wait for the security check" message is stale once the check passes
              setError((current) => (current === m.auth_form_captchaPending({}, { locale }) ? null : current))
            }}
            onExpire={() => setTurnstileToken(null)}
            options={{
              size: turnstileSize,
              // The widget's iframe takes a theme option rather than CSS: follow the page theme, OS preference until known
              theme: turnstileTheme,
              appearance: 'interaction-only',
            }}
            style={{ borderRadius: 12, overflow: 'hidden' }}
          />
        )}

        <Button
          type="submit"
          variant="contained"
          disabled={buttonDisabled}
          aria-busy={buttonLoading || undefined}
          className="!py-2.5"
          fullWidth
        >
          {buttonLoading ? (
            <CircularProgress size={20} color="inherit" aria-label={m.auth_form_pending({}, { locale })} />
          ) : isSignUp ? (
            m.auth_signUp_label({}, { locale })
          ) : (
            m.auth_form_continue({}, { locale })
          )}
        </Button>
      </form>

      <Button
        type="button"
        variant="text"
        onClick={toggleView}
        disabled={loading}
        className="!mt-2 !text-sm"
        fullWidth
        size="small"
      >
        {isSignUp ? m.auth_form_hasAccount({}, { locale }) : m.auth_form_noAccount({}, { locale })}
      </Button>
    </div>
  )
}
function ConditionalPasskey({ onSuccess }: { onSuccess?: () => void }) {
  const locale = useLocale()
  const haptic = useWebHaptics()
  useMountEffect(() => {
    let active = true

    const signInWithConditionalPasskey = async () => {
      if (
        typeof PublicKeyCredential === 'undefined' ||
        typeof PublicKeyCredential.isConditionalMediationAvailable !== 'function'
      ) {
        return
      }

      const available = await PublicKeyCredential.isConditionalMediationAvailable()
      if (!active || !available) return

      const { error } = await authClient.signIn.passkey({ autoFill: true })
      if (!active || error) return

      haptic.trigger('success')
      toast.success(m.auth_login_toastSuccess({}, { locale }))
      onSuccess?.()
    }

    void signInWithConditionalPasskey().catch(() => {})
    return () => {
      active = false
    }
  })

  return null
}