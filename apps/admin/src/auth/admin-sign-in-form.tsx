import { Turnstile, type TurnstileInstance, type TurnstileProps } from '@marsidev/react-turnstile'
import { Alert, Box, Button, Divider, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconAlertTriangle, IconBrandGithub, IconBrandGoogle, IconRefresh } from '@tabler/icons-react'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from 'react'
import type { AdminAuthClient, AdminAuthFailureKind, AdminOauthProvider } from './admin-auth-client'
import classes from './admin-sign-in-form.module.css'

type AdminSignInErrorKind = AdminAuthFailureKind | 'oauth-callback-failed'
type PendingMethod = 'password' | AdminOauthProvider
type ChallengeState = 'error' | 'expired' | 'ready' | 'unavailable' | 'waiting'
type ChallengeStatusCopyKey = Exclude<ChallengeState, 'unavailable'> | 'unavailable'

export type AdminSignInCopy = {
  readonly alternativeDivider: string
  readonly captcha: {
    readonly description: string
    readonly error: string
    readonly expired: string
    readonly label: string
    readonly ready: string
    readonly reload: string
    readonly unavailable: string
    readonly waiting: string
  }
  readonly description: string
  readonly emailLabel: string
  readonly emailPlaceholder: string
  readonly failureMessages: Readonly<Record<AdminSignInErrorKind, string>>
  readonly failureTitle: string
  readonly passwordLabel: string
  readonly providerLabels: Readonly<Record<AdminOauthProvider, string>>
  readonly submit: string
  readonly title: string
}

export type AdminTurnstileComponent = ForwardRefExoticComponent<
  TurnstileProps & RefAttributes<TurnstileInstance | undefined>
>

export type AdminSignInFormProps = {
  readonly authClient: Pick<AdminAuthClient, 'beginSocialSignIn' | 'signInWithPassword'>
  readonly captchaSiteKey?: string
  readonly copy: AdminSignInCopy
  readonly navigateExternal?: (authorizationUrl: string) => void
  readonly oauthCallbackFailed?: boolean
  readonly onSignedIn?: () => void
  readonly reload?: () => void
  readonly turnstileComponent?: AdminTurnstileComponent
}

const TURNSTILE_OPTIONS: NonNullable<TurnstileProps['options']> = {
  appearance: 'always',
  refreshExpired: 'never',
  refreshTimeout: 'never',
  responseField: false,
  retry: 'never',
  size: 'flexible',
  tabIndex: 0,
  theme: 'auto',
}

const CHALLENGE_STATUS_COPY_KEYS = {
  error: 'error',
  expired: 'expired',
  ready: 'ready',
  unavailable: 'unavailable',
  waiting: 'waiting',
} as const satisfies Readonly<Record<ChallengeState, ChallengeStatusCopyKey>>

const defaultNavigateExternal = (authorizationUrl: string) => globalThis.location.assign(authorizationUrl)
const defaultReload = () => globalThis.location.reload()

const providerIcon = (provider: AdminOauthProvider) => {
  if (provider === 'google') return <IconBrandGoogle aria-hidden="true" size={19} stroke={1.8} />
  return <IconBrandGithub aria-hidden="true" size={19} stroke={1.8} />
}

export const AdminSignInForm = ({
  authClient,
  captchaSiteKey,
  copy,
  navigateExternal = defaultNavigateExternal,
  oauthCallbackFailed = false,
  onSignedIn,
  reload = defaultReload,
  turnstileComponent: CaptchaWidget = Turnstile,
}: AdminSignInFormProps) => {
  const challengeRef = useRef<TurnstileInstance>(null)
  const attemptInFlightRef = useRef(false)
  const [challengeState, setChallengeState] = useState<ChallengeState>('waiting')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pendingMethod, setPendingMethod] = useState<PendingMethod | null>(null)
  const [errorKind, setErrorKind] = useState<AdminSignInErrorKind | null>(
    oauthCallbackFailed ? 'oauth-callback-failed' : null,
  )

  const captchaEnabled = Boolean(captchaSiteKey?.trim())
  const busy = pendingMethod !== null
  const passwordBlocked = busy || (captchaEnabled && (!captchaToken || challengeState !== 'ready'))
  const challengeStatusId = 'admin-sign-in-challenge-status'
  const errorId = 'admin-sign-in-error'

  const resetChallenge = useCallback((nextState: ChallengeState) => {
    setCaptchaToken(null)
    setChallengeState(nextState)
    challengeRef.current?.reset()
  }, [])

  const handleChallengeSuccess = useCallback((token: string) => {
    setCaptchaToken(token)
    setChallengeState('ready')
    setErrorKind((current) => (current === 'captcha-rejected' || current === 'captcha-required' ? null : current))
  }, [])

  const handleChallengeExpire = useCallback(() => resetChallenge('expired'), [resetChallenge])
  const handleChallengeError = useCallback(() => resetChallenge('error'), [resetChallenge])
  const handleChallengeUnavailable = useCallback(() => {
    setCaptchaToken(null)
    setChallengeState('unavailable')
  }, [])

  const turnstileScriptOptions = useMemo(() => ({ onError: handleChallengeUnavailable }), [handleChallengeUnavailable])

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (passwordBlocked || attemptInFlightRef.current) return

    attemptInFlightRef.current = true
    setPendingMethod('password')
    setErrorKind(null)
    let signedIn = false
    try {
      const result = await authClient.signInWithPassword({
        ...(captchaToken ? { captchaToken } : {}),
        email,
        password,
      })
      if (result.ok) signedIn = true
      else if (result.failure.kind !== 'cancelled') setErrorKind(result.failure.kind)
    } finally {
      attemptInFlightRef.current = false
      setPassword('')
      setPendingMethod(null)
      if (captchaEnabled) resetChallenge('waiting')
    }

    if (signedIn) onSignedIn?.()
  }

  const handleSocialSignIn = async (provider: AdminOauthProvider) => {
    if (busy || attemptInFlightRef.current) return
    attemptInFlightRef.current = true
    setPassword('')
    setPendingMethod(provider)
    setErrorKind(null)

    try {
      const result = await authClient.beginSocialSignIn(provider)
      if (!result.ok) {
        if (result.failure.kind !== 'cancelled') setErrorKind(result.failure.kind)
        return
      }

      try {
        navigateExternal(result.data.authorizationUrl)
      } catch {
        setErrorKind('provider-unavailable')
      }
    } finally {
      attemptInFlightRef.current = false
      setPendingMethod(null)
      if (captchaEnabled) resetChallenge('waiting')
    }
  }

  const challengeStatus = copy.captcha[CHALLENGE_STATUS_COPY_KEYS[challengeState]]

  return (
    <Stack className={classes.root} gap="lg">
      <Stack gap={6}>
        <Title className={classes.title} id="admin-sign-in-title" order={1}>
          {copy.title}
        </Title>
        <Text c="dimmed" className={classes.description}>
          {copy.description}
        </Text>
      </Stack>

      {errorKind ? (
        <Alert
          color="red"
          icon={<IconAlertTriangle aria-hidden="true" size={19} stroke={1.8} />}
          id={errorId}
          role="alert"
          title={copy.failureTitle}
          variant="light"
        >
          {copy.failureMessages[errorKind]}
        </Alert>
      ) : null}

      <Stack gap="sm">
        {(['google', 'github'] as const).map((provider) => {
          const pending = pendingMethod === provider
          return (
            <Button
              className={classes.actionButton}
              disabled={busy}
              fullWidth
              key={provider}
              leftSection={providerIcon(provider)}
              loading={pending}
              mih={44}
              onClick={() => void handleSocialSignIn(provider)}
              type="button"
              variant="default"
            >
              {copy.providerLabels[provider]}
            </Button>
          )
        })}
      </Stack>

      <Divider label={copy.alternativeDivider} labelPosition="center" />

      <Box
        component="form"
        aria-describedby={errorKind ? errorId : undefined}
        aria-labelledby="admin-sign-in-title"
        onSubmit={handlePasswordSubmit}
      >
        <Stack gap="md">
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            disabled={busy}
            label={copy.emailLabel}
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder={copy.emailPlaceholder}
            required
            spellCheck={false}
            type="email"
            value={email}
          />
          <PasswordInput
            autoComplete="current-password"
            disabled={busy}
            label={copy.passwordLabel}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            value={password}
          />

          {captchaEnabled ? (
            <Box
              aria-describedby={challengeStatusId}
              aria-labelledby="admin-sign-in-challenge-label"
              className={classes.challenge}
              component="fieldset"
            >
              <Stack gap="xs">
                <Box>
                  <Text fw={650} id="admin-sign-in-challenge-label" size="sm">
                    {copy.captcha.label}
                  </Text>
                  <Text c="dimmed" className={classes.description} size="sm">
                    {copy.captcha.description}
                  </Text>
                </Box>

                {challengeState === 'unavailable' ? (
                  <Button
                    className={classes.actionButton}
                    leftSection={<IconRefresh aria-hidden="true" size={18} stroke={1.8} />}
                    mih={40}
                    onClick={reload}
                    type="button"
                    variant="default"
                  >
                    {copy.captcha.reload}
                  </Button>
                ) : (
                  <CaptchaWidget
                    aria-describedby={challengeStatusId}
                    aria-labelledby="admin-sign-in-challenge-label"
                    className={classes.turnstile}
                    onError={handleChallengeError}
                    onExpire={handleChallengeExpire}
                    onSuccess={handleChallengeSuccess}
                    onTimeout={handleChallengeError}
                    onUnsupported={handleChallengeUnavailable}
                    options={TURNSTILE_OPTIONS}
                    ref={challengeRef}
                    scriptOptions={turnstileScriptOptions}
                    siteKey={captchaSiteKey!.trim()}
                  />
                )}

                <Text
                  aria-live="polite"
                  c={challengeState === 'error' || challengeState === 'unavailable' ? 'red' : 'dimmed'}
                  id={challengeStatusId}
                  role={challengeState === 'error' || challengeState === 'unavailable' ? 'alert' : 'status'}
                  size="sm"
                >
                  {challengeStatus}
                </Text>
              </Stack>
            </Box>
          ) : null}

          <Button
            aria-describedby={captchaEnabled ? challengeStatusId : undefined}
            className={classes.actionButton}
            disabled={passwordBlocked}
            fullWidth
            loading={pendingMethod === 'password'}
            mih={44}
            type="submit"
          >
            {copy.submit}
          </Button>
        </Stack>
      </Box>
    </Stack>
  )
}