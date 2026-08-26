import { Alert, Button, Center, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle, IconCircleCheck, IconLock, IconRefresh } from '@tabler/icons-react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useAdminAuthClient } from '../auth/admin-authorization-provider'
import { useAdminAuth, useAdminAuthActions } from '../auth/admin-auth-context'
import { AdminSignInForm, type AdminSignInCopy } from '../auth/admin-sign-in-form'
import { useAdminSession } from '../auth/admin-session-provider'
import { useAdminTranslation } from '../i18n'
import classes from './sign-in-route.module.css'

export const stripAdminSignInQuery = ({
  hash,
  history,
  pathname,
}: {
  readonly hash: string
  readonly history: Pick<History, 'replaceState' | 'state'>
  readonly pathname: string
}) => history.replaceState(history.state, '', `${pathname}${hash}`)

const SignInState = ({
  action,
  busy = false,
  description,
  title,
}: {
  readonly action?: ReactNode
  readonly busy?: boolean
  readonly description: string
  readonly title: string
}) => (
  <Stack gap="lg">
    {busy ? <Loader aria-label={title} size="md" /> : <IconAlertTriangle aria-hidden="true" size={32} />}
    <Stack gap={6}>
      <Title order={1}>{title}</Title>
      <Text c="dimmed">{description}</Text>
    </Stack>
    {action}
  </Stack>
)

export const SignInRoute = () => {
  const { t } = useAdminTranslation()
  const auth = useAdminAuth()
  const actions = useAdminAuthActions()
  const authClient = useAdminAuthClient()
  const session = useAdminSession()
  const location = useLocation()
  const navigate = useNavigate()
  const initialSearch = useRef(location.searchStr)
  const redirectStarted = useRef(false)
  const oauthCallbackFailed = new URLSearchParams(initialSearch.current).get('oauth') === 'failed'

  useLayoutEffect(() => {
    if (!initialSearch.current) return
    stripAdminSignInQuery({
      hash: globalThis.location.hash,
      history: globalThis.history,
      pathname: globalThis.location.pathname,
    })
  }, [])

  useEffect(() => {
    if (auth.status !== 'authenticated' || redirectStarted.current) return
    redirectStarted.current = true
    void navigate({ replace: true, to: '/' })
  }, [auth.status, navigate])

  if (auth.status === 'authenticated') {
    return (
      <Center component="main" className={classes.page}>
        <Paper className={classes.card} p="xl" radius="lg">
          <SignInState busy description={t('signIn.redirect.description')} title={t('signIn.redirect.title')} />
        </Paper>
      </Center>
    )
  }

  const copy: AdminSignInCopy = {
    alternativeDivider: t('signIn.alternativeDivider'),
    captcha: {
      description: t('signIn.captcha.description'),
      error: t('signIn.captcha.error'),
      expired: t('signIn.captcha.expired'),
      label: t('signIn.captcha.label'),
      ready: t('signIn.captcha.ready'),
      reload: t('signIn.captcha.reload'),
      unavailable: t('signIn.captcha.unavailable'),
      waiting: t('signIn.captcha.waiting'),
    },
    description: t('signIn.description'),
    emailLabel: t('signIn.email'),
    emailPlaceholder: t('signIn.emailPlaceholder'),
    failureMessages: {
      cancelled: t('signIn.failure.cancelled'),
      'captcha-rejected': t('signIn.failure.captchaRejected'),
      'captcha-required': t('signIn.failure.captchaRequired'),
      'invalid-credentials': t('signIn.failure.invalidCredentials'),
      'oauth-callback-failed': t('signIn.failure.oauthCallback'),
      'provider-unavailable': t('signIn.failure.providerUnavailable'),
      'rate-limited': t('signIn.failure.rateLimited'),
      'session-expired': t('signIn.failure.sessionExpired'),
      unavailable: t('signIn.failure.unavailable'),
      unexpected: t('signIn.failure.unexpected'),
    },
    failureTitle: t('signIn.failure.title'),
    passwordLabel: t('signIn.password'),
    providerLabels: {
      github: t('signIn.provider.github'),
      google: t('signIn.provider.google'),
    },
    submit: t('signIn.submit'),
    title: t('signIn.title'),
  }

  return (
    <Center component="main" className={classes.page}>
      <Paper className={classes.card} p="xl" radius="lg">
        {auth.status === 'pending' || auth.status === 'clearing' || auth.status === 'signing-out' ? (
          <SignInState
            busy
            description={t(auth.status === 'signing-out' ? 'auth.signingOut.description' : 'auth.pending.description')}
            title={t(auth.status === 'signing-out' ? 'auth.signingOut.title' : 'auth.pending.title')}
          />
        ) : auth.status === 'forbidden' || auth.status === 'fresh-login-required' ? (
          <SignInState
            action={
              <Button leftSection={<IconLock aria-hidden="true" size={18} />} onClick={() => void actions.signOut()}>
                {t('actions.useAnotherAccount')}
              </Button>
            }
            description={t(
              auth.status === 'forbidden' ? 'auth.forbidden.description' : 'error.freshLoginRequired.description',
            )}
            title={t(auth.status === 'forbidden' ? 'auth.forbidden.title' : 'error.freshLoginRequired.title')}
          />
        ) : auth.status === 'unavailable' ? (
          <SignInState
            action={
              <Button leftSection={<IconRefresh aria-hidden="true" size={18} />} onClick={() => void actions.retry()}>
                {t('actions.retry')}
              </Button>
            }
            description={t('auth.unavailable.description')}
            title={t('auth.unavailable.title')}
          />
        ) : (
          <Stack gap="lg">
            {auth.reason === 'signed-out' ? (
              <Alert color="green" component="output" icon={<IconCircleCheck aria-hidden="true" size={18} />}>
                {t('signIn.signedOut')}
              </Alert>
            ) : auth.reason === 'expired-or-revoked' ? (
              <Alert color="orange" icon={<IconAlertTriangle aria-hidden="true" size={18} />} role="alert">
                {t('signIn.sessionExpired')}
              </Alert>
            ) : null}
            <AdminSignInForm
              authClient={authClient}
              captchaSiteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || undefined}
              copy={copy}
              oauthCallbackFailed={oauthCallbackFailed}
              onSignedIn={() => void session.refetch()}
            />
          </Stack>
        )}
      </Paper>
    </Center>
  )
}