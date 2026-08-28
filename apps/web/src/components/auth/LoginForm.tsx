import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { Alert, Button, Chip, CircularProgress, Divider, TextField } from '@mui/material'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useEffectOnce as useMountEffect } from 'react-use'
import { useWebHaptics } from 'web-haptics/react'
import IconLogosGithub from '~icons/logos/github-icon'
import IconLogosGoogle from '~icons/logos/google-icon'
import IconPasskey from '~icons/material-symbols/passkey'
import { authClient } from '../../lib/auth-client'
import { formatErrorMessage } from '../../utils/formatErrorMessage'
import { PasswordVisibilityAdornment } from './PasswordVisibilityAdornment'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

interface LoginFormValues {
  email: string
  password: string
}

type AuthProvider = 'google' | 'github' | 'passkey' | 'email'

export const LoginForm = ({
  idPrefix = 'auth',
  onPendingChange,
  onSuccess,
}: {
  idPrefix?: string
  onPendingChange?: (pending: boolean) => void
  onSuccess?: () => void
}) => {
  const { t } = useTranslation(['auth'])
  const {
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
  } = useForm<LoginFormValues>({
    mode: 'onChange',
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
  const lastUsedMethod = authClient.getLastUsedLoginMethod() as AuthProvider | null
  const isLastUsed = (provider: AuthProvider) => lastUsedMethod === provider

  const setActiveProvider = (provider: AuthProvider | null) => {
    setPendingProvider(provider)
    onPendingChange?.(provider !== null)
  }

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
      toast.success(t('auth:login.toast-success'))
      onSuccess?.()
    }

    void signInWithConditionalPasskey().catch(() => {})
    return () => {
      active = false
    }
  })

  const captchaHeaders = turnstileToken ? { 'x-captcha-response': turnstileToken } : undefined
  const waitingForTurnstile = !!TURNSTILE_SITE_KEY && !turnstileToken
  const buttonLoading = loading || (isValid && waitingForTurnstile)
  const buttonDisabled = loading || !isValid || waitingForTurnstile

  const onSubmit = async (data: LoginFormValues) => {
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
        toast.success(t('auth:sign-up.toast-success'))
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
        toast.success(t('auth:login.toast-success'))
        onSuccess?.()
      }
    } catch (e: unknown) {
      haptic.trigger('error')
      setError(formatErrorMessage(e, t('auth:form.error-generic')))
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
      toast.success(t('auth:login.toast-success'))
      onSuccess?.()
    } catch (e: unknown) {
      haptic.trigger('error')
      setError(formatErrorMessage(e, t('auth:form.error-passkey')))
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

  const formTitleId = `${idPrefix}-${isSignUp ? 'sign-up' : 'sign-in'}-form-title`
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
        <div className="text-center mb-1">
          <h2 id={formTitleId} className="text-xl font-bold m-0">
            {isSignUp ? t('auth:sign-up.title') : t('auth:form.title')}
          </h2>
          <div className="text-sm text-zinc-500 mt-1">{t('auth:form.subtitle')}</div>
        </div>

        {error && <Alert severity="error">{error}</Alert>}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant={isLastUsed('github') ? 'contained' : 'outlined'}
            startIcon={
              pendingProvider === 'github' ? <CircularProgress size={20} /> : <IconLogosGithub className="w-5 h-5" />
            }
            endIcon={
              isLastUsed('github') ? (
                <Chip label={t('auth:form.last-used')} size="small" color="primary" className="!h-5 !text-[0.65rem]" />
              ) : undefined
            }
            onClick={() => handleSocial('github')}
            disabled={loading}
            className="!py-2.5 !text-sm !normal-case"
            fullWidth
          >
            {t('auth:form.continue-with-github')}
          </Button>
          <Button
            type="button"
            variant={isLastUsed('google') ? 'contained' : 'outlined'}
            startIcon={
              pendingProvider === 'google' ? <CircularProgress size={20} /> : <IconLogosGoogle className="w-5 h-5" />
            }
            endIcon={
              isLastUsed('google') ? (
                <Chip label={t('auth:form.last-used')} size="small" color="primary" className="!h-5 !text-[0.65rem]" />
              ) : undefined
            }
            onClick={() => handleSocial('google')}
            disabled={loading}
            className="!py-2.5 !text-sm !normal-case"
            fullWidth
          >
            {t('auth:form.continue-with-google')}
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
                    label={t('auth:form.last-used')}
                    size="small"
                    color="primary"
                    className="!h-5 !text-[0.65rem]"
                  />
                ) : undefined
              }
              onClick={handlePasskey}
              disabled={loading}
              className="!py-2.5 !text-sm !normal-case"
              fullWidth
            >
              {t('auth:form.sign-in-with-passkey')}
            </Button>
          )}
        </div>

        <Divider className="!my-1">
          {isLastUsed('email') ? (
            <Chip label={t('auth:form.last-used')} size="small" color="primary" className="!h-5 !text-[0.65rem]" />
          ) : (
            <span className="text-xs text-zinc-400">{t('auth:form.or')}</span>
          )}
        </Divider>

        <div className="flex flex-col gap-2">
          <TextField
            id={emailId}
            {...register('email', {
              required: t('auth:form.validation.email-required'),
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: t('auth:form.validation.email-invalid'),
              },
            })}
            label={t('auth:form.email')}
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
              required: t('auth:form.validation.password-required'),
              minLength: {
                value: 8,
                message: t('auth:form.validation.password-min-length'),
              },
            })}
            label={t('auth:form.password')}
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
                  fieldLabel={t('auth:form.password')}
                  inputId={passwordId}
                  onToggle={() => setShowPassword((visible) => !visible)}
                />
              ),
            }}
          />
        </div>

        {TURNSTILE_SITE_KEY && (
          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
            options={{ size: 'flexible', theme: 'light', appearance: 'interaction-only' }}
            style={{ borderRadius: 12, overflow: 'hidden' }}
          />
        )}

        <Button type="submit" variant="contained" disabled={buttonDisabled} className="!py-2.5" fullWidth>
          {buttonLoading ? (
            <CircularProgress size={20} />
          ) : isSignUp ? (
            t('auth:sign-up.label')
          ) : (
            t('auth:form.continue')
          )}
        </Button>
      </form>

      <Button
        type="button"
        variant="text"
        onClick={toggleView}
        disabled={loading}
        className="!mt-2 !text-sm !normal-case"
        fullWidth
        size="small"
      >
        {isSignUp ? t('auth:form.has-account') : t('auth:form.no-account')}
      </Button>
    </div>
  )
}