import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { Alert, Button, Chip, CircularProgress, Divider, TextField } from '@mui/material'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useWebHaptics } from 'web-haptics/react'
import IconLogosGithub from '~icons/logos/github-icon'
import IconLogosGoogle from '~icons/logos/google-icon'
import IconPasskey from '~icons/material-symbols/passkey'
import { authClient } from '../../lib/auth-client'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const TRANSITION = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
}

interface LoginFormValues {
  email: string
  password: string
}

type AuthProvider = 'google' | 'github' | 'passkey' | 'email'

export const LoginForm = ({
  onPendingChange,
  onSuccess,
}: {
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
  const [direction, setDirection] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)
  const lastUsedMethod = authClient.getLastUsedLoginMethod() as AuthProvider | null
  const isLastUsed = (provider: AuthProvider) => lastUsedMethod === provider

  useEffect(() => {
    onPendingChange?.(loading)
  }, [loading, onPendingChange])

  const innerRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setContentHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const captchaHeaders = turnstileToken ? { 'x-captcha-response': turnstileToken } : undefined
  const waitingForTurnstile = !!TURNSTILE_SITE_KEY && !turnstileToken
  const buttonLoading = loading || (isValid && waitingForTurnstile)
  const buttonDisabled = loading || !isValid || waitingForTurnstile

  const onSubmit = async (data: LoginFormValues) => {
    setPendingProvider('email')
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
    } catch (e: any) {
      haptic.trigger('error')
      setError(e.message || t('auth:form.error-generic'))
    } finally {
      setPendingProvider(null)
      turnstileRef.current?.reset()
      setTurnstileToken(null)
    }
  }

  const handleSocial = async (provider: 'google' | 'github') => {
    setPendingProvider(provider)
    await authClient.signIn.social({
      provider,
      callbackURL: window.location.href,
      errorCallbackURL: window.location.href,
    })
    // No setPendingProvider(null) because it redirects
  }

  const handlePasskey = async () => {
    setPendingProvider('passkey')
    try {
      const { error } = await authClient.signIn.passkey()
      if (error) throw error
      haptic.trigger('success')
      toast.success(t('auth:login.toast-success'))
      onSuccess?.()
    } catch (e: any) {
      haptic.trigger('error')
      setError(e.message || t('auth:form.error-passkey'))
    } finally {
      setPendingProvider(null)
    }
  }

  const toggleView = () => {
    setDirection(isSignUp ? -1 : 1)
    setIsSignUp(!isSignUp)
    setError(null)
  }

  return (
    <div className="w-full">
      <motion.div
        initial={false}
        animate={{ height: contentHeight ?? 'auto' }}
        transition={TRANSITION}
        className="overflow-hidden -m-4"
      >
        <div ref={innerRef} className="relative p-4">
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div
              key={isSignUp ? 'register' : 'login'}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={TRANSITION}
              className="flex flex-col gap-3"
            >
              <div className="text-center mb-1">
                <div className="text-xl font-bold">{isSignUp ? t('auth:sign-up.title') : t('auth:form.title')}</div>
                <div className="text-sm text-zinc-500 mt-1">{t('auth:form.subtitle')}</div>
              </div>

              {error && <Alert severity="error">{error}</Alert>}

              <div className="flex flex-col gap-2">
                <Button
                  variant={isLastUsed('github') ? 'contained' : 'outlined'}
                  startIcon={
                    pendingProvider === 'github' ? (
                      <CircularProgress size={20} />
                    ) : (
                      <IconLogosGithub className="w-5 h-5" />
                    )
                  }
                  endIcon={
                    isLastUsed('github') ? (
                      <Chip
                        label={t('auth:form.last-used')}
                        size="small"
                        color="primary"
                        className="!h-5 !text-[0.65rem]"
                      />
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
                  variant={isLastUsed('google') ? 'contained' : 'outlined'}
                  startIcon={
                    pendingProvider === 'google' ? (
                      <CircularProgress size={20} />
                    ) : (
                      <IconLogosGoogle className="w-5 h-5" />
                    )
                  }
                  endIcon={
                    isLastUsed('google') ? (
                      <Chip
                        label={t('auth:form.last-used')}
                        size="small"
                        color="primary"
                        className="!h-5 !text-[0.65rem]"
                      />
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
                    variant={isLastUsed('passkey') ? 'contained' : 'outlined'}
                    startIcon={
                      pendingProvider === 'passkey' ? (
                        <CircularProgress size={20} />
                      ) : (
                        <IconPasskey className="size-5" />
                      )
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
                  <Chip
                    label={t('auth:form.last-used')}
                    size="small"
                    color="primary"
                    className="!h-5 !text-[0.65rem]"
                  />
                ) : (
                  <span className="text-xs text-zinc-400">{t('auth:form.or')}</span>
                )}
              </Divider>

              <div className="flex flex-col gap-2">
                <TextField
                  {...register('email', {
                    required: t('auth:form.validation.email-required'),
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: t('auth:form.validation.email-invalid'),
                    },
                  })}
                  label={t('auth:form.email')}
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  disabled={loading}
                  fullWidth
                  size="small"
                />
                <TextField
                  {...register('password', {
                    required: t('auth:form.validation.password-required'),
                    minLength: {
                      value: 8,
                      message: t('auth:form.validation.password-min-length'),
                    },
                  })}
                  label={t('auth:form.password')}
                  type="password"
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  disabled={loading}
                  fullWidth
                  size="small"
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

              <Button
                variant="contained"
                onClick={handleFormSubmit(onSubmit)}
                disabled={buttonDisabled}
                className="!py-2.5"
                fullWidth
              >
                {buttonLoading ? (
                  <CircularProgress size={20} />
                ) : isSignUp ? (
                  t('auth:sign-up.label')
                ) : (
                  t('auth:form.continue')
                )}
              </Button>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <Button
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