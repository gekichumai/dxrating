import { CAPTCHA_RESPONSE_HEADER } from '@gekichumai/api-contract'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { WebAuthnAbortService } from '@simplewebauthn/browser'
import { useResolvedTheme } from '@/utils/useResolvedTheme'
import { Alert, Button, Chip, CircularProgress, Divider, TextField, useMediaQuery } from '@mui/material'
import clsx from 'clsx'
import { useRef, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useEffectOnce as useMountEffect } from 'react-use'
import { useWebHaptics } from 'web-haptics/react'
import IconLogosGithub from '~icons/logos/github-icon'
import IconLogosGoogle from '~icons/logos/google-icon'
import IconPasskey from '~icons/material-symbols/passkey'
import IconArrowLeft from '~icons/mdi/arrow-left'
import { EMAIL_VERIFICATION_NONCE_FIELD, EMAIL_VERIFICATION_TOKEN_FIELD } from '@gekichumai/api-contract'
import { authClient } from '../../lib/auth-client'
import { formatErrorMessage } from '../../utils/formatErrorMessage'
import { hasErrorCode } from './authLinks'
import { isAuthMailEnabled } from '../../setup/auth-mail'
import { PasswordVisibilityAdornment } from './PasswordVisibilityAdornment'
import { useLocale } from '@/i18n/LocaleProvider'
import { ParaglideMessage } from '@inlang/paraglide-js-react'
import { m } from '@/paraglide/messages'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128

interface LoginFormValues {
  email: string
  password: string
}

type AuthProvider = 'google' | 'github' | 'passkey' | 'email'

/**
 * The form walks through two steps. `start` offers every way in: a passkey, GitHub, Google, or an email address.
 * `credentials` follows the email address: a password to sign in, or a passkey (a password if the visitor prefers) to
 * create an account.
 */
type Step = 'start' | 'credentials'

/** Id of the form's heading, stable across sign-in and sign-up, so a dialog around the form can take it as its name */
export const loginFormTitleId = (idPrefix: string) => `${idPrefix}-auth-form-title`

const LAST_USED_CHIP_CLASS = '!h-5 !text-xs !font-semibold'
// On the filled (last used) button, the chip inverts so it doesn't vanish into the same accent fill
const LAST_USED_BUTTON_CHIP_CLASS = `${LAST_USED_CHIP_CLASS} !bg-surface/90 !text-accent-strong`

/** The visitor closed the browser's passkey prompt: not an error worth a message */
const CANCELLED_PASSKEY_CODES = new Set(['AUTH_CANCELLED', 'ERROR_CEREMONY_ABORTED'])
const isCancelledPasskey = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string' &&
  CANCELLED_PASSKEY_CODES.has(error.code)

const browserSupportsPasskeys = () => typeof PublicKeyCredential === 'function'

/**
 * After a password sign-in or sign-up, asks the password manager to create a passkey for the account without a prompt
 * (Chrome's automatic passkey upgrade, conditional create). Browsers without it are left alone: on them the same call
 * would open a full passkey dialog the visitor never asked for. Whatever happens, the sign-in already succeeded.
 */
const upgradeToPasskeyQuietly = async () => {
  if (!browserSupportsPasskeys()) return
  const getCapabilities = (
    PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }
  ).getClientCapabilities
  if (typeof getCapabilities !== 'function') return
  const capabilities = await getCapabilities.call(PublicKeyCredential)
  if (capabilities.conditionalCreate !== true) return
  await authClient.passkey.addPasskey({ useAutoRegister: true })
}

/**
 * Chrome's Email Verification Protocol (gekichumai/meta#80; WICG "Email Verification API", report of 26 June 2026): a
 * sign-up form that carries an `autocomplete="email-verification-token"` field with a server-made `nonce` gets, when
 * the visitor picks an address their mail provider vouches for, a token proving it, filled into that field as the form
 * is submitted. The backend checks it and then sends no verification mail. Nothing here detects the feature: other
 * browsers ignore the field, and without a token sign-up works as before.
 *
 * The nonce comes from the backend after the visitor switches to sign-up, so the server render and the first client
 * render are the same (no field), and each form shown gets its own. The field is never there while signing in, or Chrome
 * would offer to verify the address of someone who only wants to sign in.
 *
 * Known gap: Chrome starts the protocol when the visitor picks an address from autofill, and only if the form has the
 * field at that moment (WICG §3.1 steps 1-2). An address picked on the sign-in view before switching to sign-up, or
 * before the nonce arrives, gets no token, and that sign-up gets the mail instead. The manual Chrome check of meta#80
 * covers that path; picking the address again once on the sign-up view does get a token.
 */
interface EmailVerificationNonce {
  readonly nonce: string
  readonly expiresAt: number
}

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
    getValues,
    setFocus,
    formState: { errors, isValid },
  } = useForm<LoginFormValues>({
    // Errors appear once a field is left or the form is submitted, not on the first keystroke
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
    // The email field leaves the page on the second step; its value must stay
    shouldUnregister: false,
  })
  const haptic = useWebHaptics()
  const [pendingProvider, setPendingProvider] = useState<AuthProvider | null>(null)
  const loading = pendingProvider !== null
  const [isSignUp, setIsSignUp] = useState(false)
  const [step, setStep] = useState<Step>('start')
  // How a new account is secured. Passkey unless the browser can't make one; chosen when the visitor leaves the first
  // step, since the first render happens on the server where there is no browser to ask
  const [signUpWith, setSignUpWith] = useState<'passkey' | 'password'>('passkey')
  const [canUsePasskeys, setCanUsePasskeys] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // After "Forgot password?": the address a reset link was asked for
  const [resetRequestedFor, setResetRequestedFor] = useState<string | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const [evpNonce, setEvpNonce] = useState<EmailVerificationNonce | null>(null)
  const evpInputRef = useRef<HTMLInputElement>(null)
  // The last token Chrome filled in: it fills on submission, and the form is submitted once per step
  const evpTokenRef = useRef<string | null>(null)
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
  // One filled button on the first step: the method used last time, or a passkey for a visitor who hasn't signed in
  const primaryProvider: AuthProvider =
    lastUsedMethod && (lastUsedMethod !== 'passkey' || !isSignUp) ? lastUsedMethod : isSignUp ? 'email' : 'passkey'

  const setActiveProvider = (provider: AuthProvider | null) => {
    setPendingProvider(provider)
    onPendingChange?.(provider !== null)
  }

  const captchaHeaders = turnstileToken ? { [CAPTCHA_RESPONSE_HEADER]: turnstileToken } : undefined
  const waitingForTurnstile = !!TURNSTILE_SITE_KEY && !turnstileToken
  const buttonLoading = loading || (step === 'credentials' && isValid && waitingForTurnstile)
  // Submit stays available so validation can run and focus the first invalid field; only a running request blocks it
  const buttonDisabled = loading

  const resetTurnstile = () => {
    turnstileRef.current?.reset()
    setTurnstileToken(null)
  }

  const finishSignIn = (message: string) => {
    haptic.trigger('success')
    toast.success(message)
    onSuccess?.()
  }

  /**
   * Mails a password reset link to the address of the second step. The answer is the same whether or not an account
   * uses it, so the notice says "if". The reset page (routes/account/reset-password.tsx) takes it from there.
   */
  const requestPasswordReset = async () => {
    if (waitingForTurnstile) {
      setError(m.auth_form_captchaPending({}, { locale }))
      return
    }
    const address = getValues('email').trim()
    setResetPending(true)
    setError(null)
    setResetRequestedFor(null)
    try {
      const { error } = await authClient.requestPasswordReset({
        email: address,
        fetchOptions: captchaHeaders ? { headers: captchaHeaders } : undefined,
      })
      if (error) {
        if (hasErrorCode(error, 'RESET_PASSWORD_DISABLED')) {
          setError(m.auth_form_resetUnavailable({}, { locale }))
          return
        }
        throw error
      }
      setResetRequestedFor(address)
    } catch (e: unknown) {
      fail(e, m.auth_form_errorGeneric({}, { locale }))
    } finally {
      setResetPending(false)
      resetTurnstile()
    }
  }

  /** A new nonce for the sign-up form, unless the current one has a while left; without one the field isn't shown */
  const refreshEmailVerificationNonce = async () => {
    if (evpNonce && evpNonce.expiresAt - Date.now() > 5 * 60 * 1000) return
    try {
      const { data } = await authClient.emailVerificationProtocol.nonce()
      if (!data) return
      evpTokenRef.current = null
      setEvpNonce({ nonce: data.nonce, expiresAt: Date.parse(data.expiresAt) })
    } catch {
      // A backend without the protocol: sign-up goes on without it
    }
  }

  /** Keeps the token Chrome put in the field as the form was submitted */
  const collectEmailVerificationToken = () => {
    const token = evpInputRef.current?.value
    if (token) evpTokenRef.current = token
  }

  /** The token and the nonce of the form it was made for, while the nonce is still good */
  const emailVerificationProof = () =>
    evpTokenRef.current && evpNonce && evpNonce.expiresAt > Date.now()
      ? { token: evpTokenRef.current, nonce: evpNonce.nonce }
      : undefined

  const fail = (e: unknown, fallback: string) => {
    haptic.trigger('error')
    setError(formatErrorMessage(e, fallback))
  }

  const goToCredentials = () => {
    const supported = browserSupportsPasskeys()
    setCanUsePasskeys(supported)
    if (!supported) setSignUpWith('password')
    setStep('credentials')
    setError(null)
    setResetRequestedFor(null)
    // Signing in always asks for the password; a new account asks for one only when the visitor chose it
    if (!isSignUp || !supported || signUpWith === 'password') {
      // The field mounts with this render; focus it once it's there
      requestAnimationFrame(() => setFocus('password'))
    }
  }

  const backToStart = () => {
    // The visitor may change the address; Chrome fills a token again on the next submission if it still applies
    evpTokenRef.current = null
    setStep('start')
    setShowPassword(false)
    setError(null)
    resetTurnstile()
    requestAnimationFrame(() => setFocus('email'))
  }

  const signUpWithPasskey = async (email: string) => {
    setActiveProvider('passkey')
    setError(null)
    // The passkey client sends a body of its own: the token goes along once the account exists
    const proof = emailVerificationProof()
    try {
      const { error } = await authClient.passkey.addPasskey({
        // The backend checks Turnstile before it answers anything about the address (apps/backend/src/lib/
        // passkey-sign-up.ts); the plugin sends no custom headers on that request, so the token rides in `context`
        context: JSON.stringify({ email, ...(turnstileToken ? { captcha: turnstileToken } : {}) }),
        createSession: true,
      })
      if (error) {
        if (isCancelledPasskey(error)) return
        throw error
      }
      // Unverified until it holds: the backend has mailed a link already, which still works either way
      if (proof) await authClient.emailVerificationProtocol.verify(proof).catch(() => {})
      finishSignIn(m.auth_signUp_toastSuccess({}, { locale }))
    } catch (e: unknown) {
      fail(e, m.auth_signUp_passkey_error({}, { locale }))
    } finally {
      setActiveProvider(null)
      resetTurnstile()
    }
  }

  const onSubmit = async (data: LoginFormValues) => {
    collectEmailVerificationToken()
    const email = data.email.trim()
    if (step === 'start') {
      goToCredentials()
      return
    }
    if (waitingForTurnstile) {
      setError(m.auth_form_captchaPending({}, { locale }))
      return
    }
    if (isSignUp && signUpWith === 'passkey') {
      await signUpWithPasskey(email)
      return
    }
    setActiveProvider('email')
    setError(null)
    try {
      if (isSignUp) {
        const proof = emailVerificationProof()
        // Better Auth signs a new account in straight away
        const { error } = await authClient.signUp.email({
          email,
          password: data.password,
          name: email.split('@')[0], // Default name
          // Proof the address is the visitor's: the backend then verifies it without mail (and ignores bad proof)
          ...(proof
            ? { [EMAIL_VERIFICATION_TOKEN_FIELD]: proof.token, [EMAIL_VERIFICATION_NONCE_FIELD]: proof.nonce }
            : {}),
          fetchOptions: captchaHeaders ? { headers: captchaHeaders } : undefined,
        })
        if (error) throw error
        finishSignIn(m.auth_signUp_toastSuccess({}, { locale }))
      } else {
        const { error } = await authClient.signIn.email({
          email,
          password: data.password,
          fetchOptions: captchaHeaders ? { headers: captchaHeaders } : undefined,
        })
        if (error) throw error
        finishSignIn(m.auth_login_toastSuccess({}, { locale }))
      }
      void upgradeToPasskeyQuietly().catch(() => {})
    } catch (e: unknown) {
      fail(e, m.auth_form_errorGeneric({}, { locale }))
    } finally {
      setActiveProvider(null)
      resetTurnstile()
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
      if (error) {
        if (isCancelledPasskey(error)) return
        throw error
      }
      finishSignIn(m.auth_login_toastSuccess({}, { locale }))
    } catch (e: unknown) {
      fail(e, m.auth_form_errorPasskey({}, { locale }))
    } finally {
      setActiveProvider(null)
    }
  }

  const toggleView = () => {
    if (!isSignUp) void refreshEmailVerificationNonce()
    setIsSignUp(!isSignUp)
    setShowPassword(false)
    setError(null)
    setResetRequestedFor(null)
    resetTurnstile()
  }

  const lastUsedChip = (provider: AuthProvider) =>
    isLastUsed(provider) ? (
      <Chip
        label={m.auth_form_lastUsed({}, { locale })}
        size="small"
        color="primary"
        className={primaryProvider === provider ? LAST_USED_BUTTON_CHIP_CLASS : LAST_USED_CHIP_CLASS}
      />
    ) : undefined

  const providerButton = (provider: AuthProvider, icon: ReactNode, label: string, onClick: () => void) => (
    <Button
      type="button"
      variant={primaryProvider === provider ? 'contained' : 'outlined'}
      startIcon={pendingProvider === provider ? <CircularProgress size={20} color="inherit" /> : icon}
      endIcon={lastUsedChip(provider)}
      onClick={onClick}
      disabled={loading}
      className="!py-2.5 !text-sm"
      fullWidth
    >
      {label}
    </Button>
  )

  const formTitleId = loginFormTitleId(idPrefix)
  const emailId = `${idPrefix}-${isSignUp ? 'sign-up' : 'sign-in'}-email`
  const passwordId = `${idPrefix}-${isSignUp ? 'sign-up' : 'sign-in'}-password`
  const asksForPassword = step === 'credentials' && (!isSignUp || signUpWith === 'password')
  const email = getValues('email').trim()

  const submitLabel =
    step === 'start'
      ? m.auth_form_continueWithEmail({}, { locale })
      : !isSignUp
        ? m.auth_login_label({}, { locale })
        : signUpWith === 'passkey'
          ? m.auth_signUp_passkey_create({}, { locale })
          : m.auth_signUp_label({}, { locale })

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
          {step === 'start' && (
            <p className="text-sm text-fg-2 mt-1 mb-0 text-pretty">
              {isSignUp ? m.auth_signUp_subtitle({}, { locale }) : m.auth_form_subtitle({}, { locale })}
            </p>
          )}
        </div>

        {step === 'credentials' && (
          // Who the second step is for, right under the heading; pressing it goes back to change the address
          <button
            type="button"
            onClick={backToStart}
            disabled={loading}
            className="mx-auto -mt-1 mb-1 flex max-w-full min-w-0 items-center gap-2 rounded-lg border border-solid border-ink/15 bg-transparent px-3 py-1.5 text-sm text-fg-1 cursor-pointer transition-colors hover:bg-ink/5 disabled:cursor-default disabled:opacity-60"
          >
            <IconArrowLeft className="size-4 shrink-0 text-fg-2" aria-hidden />
            <span className="truncate font-medium" translate="no">
              {email}
            </span>
            <span className="sr-only">{m.auth_form_back({}, { locale })}</span>
          </button>
        )}
        {/* Stays mounted across both steps: the browser keeps offering passkeys in the email field's autofill */}
        {!isSignUp && <ConditionalPasskey onSuccess={onSuccess} />}

        {error && <Alert severity="error">{error}</Alert>}
        {resetRequestedFor && (
          <Alert severity="success">{m.auth_form_resetSent({ email: resetRequestedFor }, { locale })}</Alert>
        )}

        {step === 'start' && (
          <>
            <div className="flex flex-col gap-2">
              {!isSignUp &&
                providerButton(
                  'passkey',
                  <IconPasskey className="size-5" />,
                  m.auth_form_signInWithPasskey({}, { locale }),
                  handlePasskey,
                )}
              {providerButton(
                'github',
                <IconLogosGithub className="w-5 h-5 dark:invert" />,
                m.auth_form_continueWithGithub({}, { locale }),
                () => handleSocial('github'),
              )}
              {providerButton(
                'google',
                <IconLogosGoogle className="w-5 h-5" />,
                m.auth_form_continueWithGoogle({}, { locale }),
                () => handleSocial('google'),
              )}
            </div>

            <Divider className="!my-1">
              {isLastUsed('email') ? (
                lastUsedChip('email')
              ) : (
                <span className="text-xs text-fg-2">{m.auth_form_or({}, { locale })}</span>
              )}
            </Divider>
          </>
        )}

        {/*
         * One email field for both steps. On the second it's hidden but stays in the form, so the browser keeps its
         * passkey autofill running and password managers save and fill the address together with the password.
         */}
        <div hidden={step !== 'start'}>
          <TextField
            id={emailId}
            {...register('email', {
              required: m.auth_form_validation_emailRequired({}, { locale }),
              pattern: {
                value: /^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/,
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
            inputProps={{ autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, inputMode: 'email' }}
          />
          {/*
           * Where Chrome puts its Email Verification Protocol token (see EmailVerificationNonce). Uncontrolled: the
           * browser writes its value, read on submit. A new nonce mounts a new field.
           */}
          {isSignUp && evpNonce && (
            <input
              key={evpNonce.nonce}
              ref={(element) => {
                evpInputRef.current = element
                // Set once the field is in the document, not as a prop: with our header-delivered CSP, Chrome blanks
                // the `nonce` attribute of every element as it is inserted (nonce hiding), and the protocol reads the
                // attribute, stopping when it is empty (WICG §3.1 steps 3-4). Hiding runs on insertion only, so a value
                // set afterwards stays. This is the form's EVP nonce, not the CSP nonce, and is no secret.
                element?.setAttribute('nonce', evpNonce.nonce)
              }}
              type="hidden"
              name="email-verification-token"
              // oxlint-disable-next-line jsx-a11y/autocomplete-valid -- the Email Verification API's new autofill token
              autoComplete="email-verification-token"
            />
          )}
        </div>

        {step === 'credentials' && (
          <>
            {asksForPassword && (
              <TextField
                id={passwordId}
                {...register('password', {
                  required: m.auth_form_validation_passwordRequired({}, { locale }),
                  minLength: {
                    value: PASSWORD_MIN_LENGTH,
                    message: m.auth_form_validation_passwordMinLength({}, { locale }),
                  },
                  maxLength: {
                    value: PASSWORD_MAX_LENGTH,
                    message: m.auth_form_validation_passwordMaxLength({}, { locale }),
                  },
                })}
                label={m.auth_form_password({}, { locale })}
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                error={!!errors.password}
                // A new password's rule shows before it's broken, not only after
                helperText={
                  errors.password?.message ?? (isSignUp ? m.auth_form_passwordHint({}, { locale }) : undefined)
                }
                disabled={loading}
                fullWidth
                size="small"
                inputProps={{
                  ...(isSignUp ? { passwordrules: `minlength: ${PASSWORD_MIN_LENGTH};` } : {}),
                  maxLength: PASSWORD_MAX_LENGTH,
                }}
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
            )}

            {!isSignUp && isAuthMailEnabled() && (
              <Button
                type="button"
                variant="text"
                size="small"
                onClick={() => void requestPasswordReset()}
                disabled={loading || resetPending}
                aria-busy={resetPending || undefined}
                className="!-mt-1 !self-end"
              >
                {m.auth_form_forgotPassword({}, { locale })}
              </Button>
            )}

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
                  // The widget's iframe takes a theme option rather than CSS: follow the page theme, OS preference until
                  // known
                  theme: turnstileTheme,
                  appearance: 'interaction-only',
                }}
                style={{ borderRadius: 12, overflow: 'hidden' }}
              />
            )}
          </>
        )}

        <Button
          type="submit"
          variant={step === 'start' && primaryProvider !== 'email' ? 'outlined' : 'contained'}
          disabled={buttonDisabled}
          aria-busy={buttonLoading || undefined}
          startIcon={
            step === 'credentials' && isSignUp && signUpWith === 'passkey' && !buttonLoading ? (
              <IconPasskey className="size-5" />
            ) : undefined
          }
          className="!py-2.5"
          fullWidth
        >
          {buttonLoading ? (
            <CircularProgress size={20} color="inherit" aria-label={m.auth_form_pending({}, { locale })} />
          ) : (
            submitLabel
          )}
        </Button>

        {step === 'credentials' && isSignUp && signUpWith === 'passkey' && (
          <p className="-mt-1 mb-0 text-center text-xs leading-relaxed text-fg-2 text-pretty">
            {m.auth_signUp_passkey_description({}, { locale })}
          </p>
        )}

        {step === 'credentials' && isSignUp && canUsePasskeys && (
          <Button
            type="button"
            variant="text"
            size="small"
            disabled={loading}
            onClick={() => {
              const next = signUpWith === 'passkey' ? 'password' : 'passkey'
              setSignUpWith(next)
              setError(null)
              if (next === 'password') requestAnimationFrame(() => setFocus('password'))
            }}
          >
            {signUpWith === 'passkey'
              ? m.auth_signUp_passkey_usePassword({}, { locale })
              : m.auth_signUp_passkey_usePasskey({}, { locale })}
          </Button>
        )}
      </form>

      <div className="mt-4 flex flex-col items-center gap-2 border-t border-t-solid border-ink/10 pt-3">
        <Button type="button" variant="text" onClick={toggleView} disabled={loading} className="!text-sm" size="small">
          {isSignUp ? m.auth_form_hasAccount({}, { locale }) : m.auth_form_noAccount({}, { locale })}
        </Button>
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
      </div>
    </div>
  )
}
function ConditionalPasskey({ onSuccess }: { onSuccess?: () => void }) {
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
      toast.success(m.auth_login_toastSuccess({}))
      onSuccess?.()
    }

    void signInWithConditionalPasskey().catch(() => {})
    return () => {
      active = false
      // Ignoring the result isn't enough: the request itself stays pending in the browser. Switching to sign-up left it
      // there, and on the next form submission Chrome (or a password manager) raised it as the full "Use a saved
      // passkey" dialog, on top of the sign-up's own result. Every ceremony goes through simplewebauthn, so this
      // cancels the autofill request, or nothing when none is pending.
      WebAuthnAbortService.cancelCeremony()
    }
  })

  return null
}