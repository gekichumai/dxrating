import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TurnstileInstance, TurnstileProps } from '@marsidev/react-turnstile'
import { forwardRef, useImperativeHandle } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminTheme } from '../theme'
import type { AdminAuthResult, AdminOauthProvider } from './admin-auth-client'
import {
  AdminSignInForm,
  type AdminSignInCopy,
  type AdminSignInFormProps,
  type AdminTurnstileComponent,
} from './admin-sign-in-form'

const copy: AdminSignInCopy = {
  alternativeDivider: 'or use a password',
  captcha: {
    description: 'Complete the anti-abuse check before this attempt.',
    error: 'The check failed. Complete it again.',
    expired: 'The check expired. Complete it again.',
    label: 'Security check',
    ready: 'Security check complete.',
    reload: 'Reload sign-in',
    unavailable: 'The security check could not load.',
    waiting: 'Waiting for the security check.',
  },
  description: 'Use an existing administrator account.',
  emailLabel: 'Email',
  emailPlaceholder: 'administrator@example.com',
  failureMessages: {
    cancelled: 'The request was cancelled.',
    'captcha-rejected': 'The security check was rejected.',
    'captcha-required': 'Complete the security check.',
    'invalid-credentials': 'The email or password is incorrect.',
    'oauth-callback-failed': 'The provider could not complete sign-in.',
    'provider-unavailable': 'The provider is unavailable.',
    'rate-limited': 'Wait before trying again.',
    'session-expired': 'The session expired.',
    unavailable: 'Sign-in is temporarily unavailable.',
    unexpected: 'Sign-in could not be completed.',
  },
  failureTitle: 'Could not sign in',
  passwordLabel: 'Password',
  providerLabels: {
    github: 'Continue with GitHub',
    google: 'Continue with Google',
  },
  submit: 'Sign in',
  title: 'Administrator sign-in',
}

const turnstileReset = vi.fn()

const FakeTurnstile: AdminTurnstileComponent = forwardRef<TurnstileInstance | undefined, TurnstileProps>(
  (props, ref) => {
    useImperativeHandle(
      ref,
      () =>
        ({
          reset: turnstileReset,
        }) as unknown as TurnstileInstance,
      [],
    )

    return (
      <div data-options={JSON.stringify(props.options)} data-site-key={props.siteKey} data-testid="turnstile">
        <button onClick={() => props.onSuccess?.('one-attempt-token')} type="button">
          Solve challenge
        </button>
        <button onClick={() => props.onExpire?.('one-attempt-token')} type="button">
          Expire challenge
        </button>
        <button onClick={() => props.onError?.('110200')} type="button">
          Fail challenge
        </button>
        <button onClick={() => props.onTimeout?.()} type="button">
          Time out challenge
        </button>
        <button onClick={() => props.onUnsupported?.()} type="button">
          Unsupported browser
        </button>
        <button onClick={() => props.scriptOptions?.onError?.()} type="button">
          Fail challenge script
        </button>
      </div>
    )
  },
)

const createAuthActions = () => ({
  beginSocialSignIn: vi.fn(
    async (provider: AdminOauthProvider): Promise<AdminAuthResult<{ authorizationUrl: string }>> => ({
      ok: true,
      data: {
        authorizationUrl:
          provider === 'google'
            ? 'https://accounts.google.com/o/oauth2/v2/auth'
            : 'https://github.com/login/oauth/authorize',
      },
    }),
  ),
  signInWithPassword: vi.fn(async (): Promise<AdminAuthResult<null>> => ({ ok: true, data: null })),
})

const renderForm = (props: Partial<AdminSignInFormProps> = {}) => {
  const authClient = props.authClient ?? createAuthActions()
  const rendered = render(
    <MantineProvider theme={adminTheme}>
      <AdminSignInForm authClient={authClient} copy={copy} turnstileComponent={FakeTurnstile} {...props} />
    </MantineProvider>,
  )
  return { ...rendered, authClient }
}

describe('administrator sign-in form', () => {
  beforeEach(() => {
    turnstileReset.mockReset()
  })

  it('uses a solved Turnstile token for one password attempt, then clears the secret and resets', async () => {
    const user = userEvent.setup()
    const onSignedIn = vi.fn()
    const { authClient } = renderForm({
      captchaSiteKey: '  site-key  ',
      onSignedIn,
    })

    const submit = screen.getByRole('button', { name: copy.submit }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.getByTestId('turnstile').getAttribute('data-site-key')).toBe('site-key')

    await user.type(screen.getByRole('textbox', { name: copy.emailLabel }), 'admin@example.com')
    await user.type(screen.getByLabelText(/^Password/), 'a-secret-password')
    await user.click(screen.getByRole('button', { name: 'Solve challenge' }))

    expect(screen.getByText(copy.captcha.ready)).toBeTruthy()
    expect(submit.disabled).toBe(false)
    await user.click(submit)

    await waitFor(() =>
      expect(authClient.signInWithPassword).toHaveBeenCalledWith({
        captchaToken: 'one-attempt-token',
        email: 'admin@example.com',
        password: 'a-secret-password',
      }),
    )
    expect(onSignedIn).toHaveBeenCalledOnce()
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('')
    expect(turnstileReset).toHaveBeenCalledOnce()
    expect(screen.getByText(copy.captcha.waiting)).toBeTruthy()
    expect(submit.disabled).toBe(true)
  })

  it('resets after expiry, widget errors, and timeouts while keeping password submission blocked', () => {
    renderForm({ captchaSiteKey: 'site-key' })
    const submit = screen.getByRole('button', { name: copy.submit }) as HTMLButtonElement

    fireEvent.click(screen.getByRole('button', { name: 'Solve challenge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expire challenge' }))
    expect(screen.getByText(copy.captcha.expired)).toBeTruthy()
    expect(submit.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Fail challenge' }))
    expect(screen.getByRole('alert').textContent).toContain(copy.captcha.error)

    fireEvent.click(screen.getByRole('button', { name: 'Time out challenge' }))
    expect(screen.getByRole('alert').textContent).toContain(copy.captcha.error)
    expect(turnstileReset).toHaveBeenCalledTimes(3)
  })

  it('offers an explicit reload when the Turnstile script or browser is unavailable', () => {
    const reload = vi.fn()
    const { rerender } = renderForm({ captchaSiteKey: 'site-key', reload })

    fireEvent.click(screen.getByRole('button', { name: 'Fail challenge script' }))
    expect(screen.queryByTestId('turnstile')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(copy.captcha.unavailable)
    fireEvent.click(screen.getByRole('button', { name: copy.captcha.reload }))
    expect(reload).toHaveBeenCalledOnce()
    expect(turnstileReset).not.toHaveBeenCalled()

    rerender(
      <MantineProvider theme={adminTheme}>
        <AdminSignInForm
          authClient={createAuthActions()}
          captchaSiteKey="site-key"
          copy={copy}
          key="unsupported-case"
          reload={reload}
          turnstileComponent={FakeTurnstile}
        />
      </MantineProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unsupported browser' }))
    expect(screen.getByRole('button', { name: copy.captcha.reload })).toBeTruthy()
  })

  it('never passes a captcha token into social sign-in and navigates only with the client result', async () => {
    const user = userEvent.setup()
    const navigateExternal = vi.fn()
    const { authClient } = renderForm({
      captchaSiteKey: 'site-key',
      navigateExternal,
    })

    await user.click(screen.getByRole('button', { name: 'Solve challenge' }))
    await user.type(screen.getByLabelText(/^Password/), 'discard-before-oauth')
    await user.click(screen.getByRole('button', { name: copy.providerLabels.google }))

    expect(authClient.beginSocialSignIn).toHaveBeenCalledWith('google')
    expect(navigateExternal).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth')
    expect(authClient.signInWithPassword).not.toHaveBeenCalled()
    expect(turnstileReset).toHaveBeenCalledOnce()
    expect(screen.getByText(copy.captcha.waiting)).toBeTruthy()
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('')
  })

  it('supports password sign-in without Turnstile when no site key is configured', async () => {
    const user = userEvent.setup()
    const { authClient } = renderForm()

    expect(screen.queryByTestId('turnstile')).toBeNull()
    await user.type(screen.getByRole('textbox', { name: copy.emailLabel }), 'admin@example.com')
    await user.type(screen.getByLabelText(/^Password/), 'password')
    await user.click(screen.getByRole('button', { name: copy.submit }))

    await waitFor(() =>
      expect(authClient.signInWithPassword).toHaveBeenCalledWith({
        email: 'admin@example.com',
        password: 'password',
      }),
    )
  })

  it('renders only localized bounded errors, including an OAuth callback failure', async () => {
    const authClient = createAuthActions()
    authClient.signInWithPassword.mockResolvedValue({
      ok: false,
      failure: { kind: 'invalid-credentials', operation: 'password' },
    })
    const user = userEvent.setup()
    const { rerender } = renderForm({ authClient })

    await user.type(screen.getByRole('textbox', { name: copy.emailLabel }), 'admin@example.com')
    await user.type(screen.getByLabelText(/^Password/), 'wrong password')
    await user.click(screen.getByRole('button', { name: copy.submit }))
    expect((await screen.findByRole('alert')).textContent).toContain(copy.failureMessages['invalid-credentials'])

    rerender(
      <MantineProvider theme={adminTheme}>
        <AdminSignInForm
          authClient={authClient}
          copy={copy}
          key="oauth-callback-case"
          oauthCallbackFailed
          turnstileComponent={FakeTurnstile}
        />
      </MantineProvider>,
    )
    expect(screen.getByRole('alert').textContent).toContain(copy.failureMessages['oauth-callback-failed'])
  })
})