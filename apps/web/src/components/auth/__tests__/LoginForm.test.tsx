import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { LocaleProvider, useSetLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { LoginForm } from '../LoginForm'

const { passkeySignIn, emailSignIn, socialSignIn, emailSignUp, addPasskey, requestPasswordReset, evpNonce, evpVerify } =
  vi.hoisted(() => ({
    evpNonce: vi.fn(),
    evpVerify: vi.fn(),
    requestPasswordReset: vi.fn(),
    passkeySignIn: vi.fn(),
    emailSignIn: vi.fn(),
    socialSignIn: vi.fn(),
    emailSignUp: vi.fn(),
    addPasskey: vi.fn(),
  }))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getLastUsedLoginMethod: () => null,
    requestPasswordReset,
    signIn: {
      email: emailSignIn,
      passkey: passkeySignIn,
      social: socialSignIn,
    },
    signUp: {
      email: emailSignUp,
    },
    passkey: {
      addPasskey,
    },
    emailVerificationProtocol: {
      nonce: evpNonce,
      verify: evpVerify,
    },
  },
}))

const { cancelCeremony } = vi.hoisted(() => ({ cancelCeremony: vi.fn() }))
vi.mock('@simplewebauthn/browser', () => ({ WebAuthnAbortService: { cancelCeremony } }))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('web-haptics/react', () => ({
  useWebHaptics: () => ({
    trigger: vi.fn(),
  }),
}))

// The committed .env sets a site key; the widget passes its check as soon as it mounts, and says so once it has
vi.mock('@marsidev/react-turnstile', async () => {
  const { forwardRef, useEffect, useState } = await import('react')
  return {
    Turnstile: forwardRef(function Turnstile({ onSuccess }: { onSuccess: (token: string) => void }, _ref) {
      const [passed, setPassed] = useState(false)
      useEffect(() => {
        onSuccess('test-token')
        setPassed(true)
      }, [onSuccess])
      return <div data-testid="turnstile" data-passed={passed} />
    }),
  }
})

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_AUTH_MAIL_ENABLED', 'true')
    passkeySignIn.mockResolvedValue({ error: null })
    evpNonce.mockResolvedValue({ data: null, error: { status: 404 } })
    evpVerify.mockResolvedValue({ data: { verified: true }, error: null })
  })

  /** Enters an email address on the first step and moves on to the second */
  const continueWithEmail = async (email = 'demo@example.com') => {
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
    await screen.findByRole('button', { name: /Back to all sign-in options/ })
    // Until the check passes, a request only says to wait for it
    await waitFor(() => expect(screen.getByTestId('turnstile').dataset.passed).toBe('true'))
  }

  it('asks for the email address alone first, with passkey autofill on it', () => {
    render(<LoginForm />)

    const form = screen.getByRole('form', { name: 'Sign in' })
    const email = screen.getByLabelText(/^Email/)
    const submit = screen.getByRole('button', { name: 'Continue with email' })

    expect(form.tagName).toBe('FORM')
    expect(email.getAttribute('id')).toBe('auth-sign-in-email')
    expect(email.getAttribute('name')).toBe('email')
    expect(email.getAttribute('type')).toBe('email')
    expect(email.getAttribute('autocomplete')).toBe('username webauthn')
    expect(email.getAttribute('autocapitalize')).toBe('none')
    expect(email.hasAttribute('required')).toBe(true)
    expect(submit.getAttribute('type')).toBe('submit')
    expect(screen.queryByLabelText(/^Password/)).toBeNull()
    // A passkey is the way in a new visitor is offered first
    expect(screen.getByRole('button', { name: 'Sign in with passkey' }).className).toContain('contained')
  })

  it('mails a password reset link for the address of the second step', async () => {
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null })
    render(<LoginForm />)
    await continueWithEmail(' demo@example.com ')

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith(expect.objectContaining({ email: 'demo@example.com' })),
    )
    expect(
      await screen.findByText("If an account uses demo@example.com, we've emailed it a link to choose a new password."),
    ).toBeTruthy()
  })

  it('says when password reset is off', async () => {
    requestPasswordReset.mockResolvedValue({
      data: null,
      error: { code: 'RESET_PASSWORD_DISABLED', message: "Reset password isn't enabled", status: 400 },
    })
    render(<LoginForm />)
    await continueWithEmail()
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect((await screen.findByRole('alert')).textContent).toBe("Password reset by email isn't available right now.")
  })

  it('offers no password reset in a build without account email', async () => {
    vi.stubEnv('VITE_AUTH_MAIL_ENABLED', '')
    render(<LoginForm />)
    await continueWithEmail()
    expect(screen.getByLabelText(/^Password/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull()
  })

  it('offers no password reset while creating an account', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
    await continueWithEmail()
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull()
  })

  it('asks for the password on the second step, with the address kept for password managers', async () => {
    render(<LoginForm />)
    await continueWithEmail(' demo@example.com ')

    const password = screen.getByLabelText(/^Password/)
    expect(password.getAttribute('id')).toBe('auth-sign-in-password')
    expect(password.getAttribute('name')).toBe('password')
    expect(password.getAttribute('type')).toBe('password')
    expect(password.getAttribute('autocomplete')).toBe('current-password')
    expect(password.hasAttribute('required')).toBe(true)
    // The address stays in the form, hidden, for password managers and passkey autofill
    const username = document.querySelector<HTMLInputElement>('input[name="email"]')!
    expect(username.getAttribute('autocomplete')).toBe('username webauthn')
    expect(username.closest('[hidden]')).not.toBeNull()
    expect(screen.getByText('demo@example.com')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show Password' }))
    expect(password.getAttribute('type')).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide Password' }).getAttribute('aria-pressed')).toBe('true')

    emailSignIn.mockResolvedValue({ error: null })
    fireEvent.change(password, { target: { value: 'demo-password' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    await waitFor(() =>
      expect(emailSignIn).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'demo@example.com', password: 'demo-password' }),
      ),
    )
  })

  it('goes back to every sign-in option with the address kept', async () => {
    render(<LoginForm />)
    await continueWithEmail()

    // The way back is the account chip: it shows the address it goes back to change
    const chip = screen.getByRole('button', { name: /Back to all sign-in options/ })
    expect(chip.textContent).toContain('demo@example.com')
    fireEvent.click(chip)

    const email = screen.getByLabelText(/^Email/) as HTMLInputElement
    expect(email.closest('[hidden]')).toBeNull()
    expect(email.value).toBe('demo@example.com')
    expect(screen.queryByLabelText(/^Password/)).toBeNull()
  })

  it('keeps the first step when the address is invalid', async () => {
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))

    await screen.findByText('Enter an email address, such as name@example.com')
    expect(screen.queryByLabelText(/^Password/)).toBeNull()
  })

  it('shows a linked agreement notice without gating social login', async () => {
    render(<LoginForm />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms-of-service')
    expect(screen.getByText(/By signing in or creating an account/).textContent).toBe(
      'By signing in or creating an account, you agree to the Terms of Service.',
    )
    expect(screen.getByRole('button', { name: 'Continue with Google' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(socialSignIn).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' })))
  })

  it('switches to one registration form without leaving duplicate controls mounted', () => {
    render(<LoginForm />)

    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))

    expect(screen.getAllByRole('form')).toHaveLength(1)
    expect(screen.getAllByLabelText(/^Email/)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Sign in with passkey' })).toBeNull()
    expect(screen.getByLabelText(/^Email/).getAttribute('id')).toBe('auth-sign-up-email')
    expect(screen.getByLabelText(/^Email/).getAttribute('autocomplete')).toBe('email')
    expect(screen.getByRole('button', { name: 'Continue with email' }).getAttribute('type')).toBe('submit')
  })

  it('creates a new account with a passkey, signed in, without a password', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    addPasskey.mockResolvedValue({ data: {}, error: null })
    const onSuccess = vi.fn()
    render(<LoginForm onSuccess={onSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
    await continueWithEmail('New@example.com ')

    expect(screen.queryByLabelText(/^Password/)).toBeNull()
    expect(screen.getAllByTestId('turnstile')).toHaveLength(1)
    fireEvent.click(await screen.findByRole('button', { name: 'Create a passkey' }))

    await waitFor(() =>
      expect(addPasskey).toHaveBeenCalledWith(
        expect.objectContaining({
          context: JSON.stringify({ email: 'New@example.com', captcha: 'test-token' }),
          createSession: true,
        }),
      ),
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(toast.success).toHaveBeenCalledWith("Account created. You're signed in.")
    expect(emailSignUp).not.toHaveBeenCalled()
  })

  it('says nothing when the visitor closes the passkey prompt', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    addPasskey.mockResolvedValue({ data: null, error: { code: 'ERROR_CEREMONY_ABORTED', message: 'cancelled' } })
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
    await continueWithEmail()
    fireEvent.click(await screen.findByRole('button', { name: 'Create a passkey' }))

    await waitFor(() => expect(addPasskey).toHaveBeenCalled())
    // Settled: the form is usable again
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Back to all sign-in options/ }).hasAttribute('disabled')).toBe(false),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('creates a new account with a password when the visitor prefers one, and signs them in', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    emailSignUp.mockResolvedValue({ error: null })
    const onSuccess = vi.fn()
    render(<LoginForm onSuccess={onSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
    await continueWithEmail()
    fireEvent.click(screen.getByRole('button', { name: 'Use a password instead' }))

    const password = screen.getByLabelText(/^Password/)
    expect(password.getAttribute('id')).toBe('auth-sign-up-password')
    expect(password.getAttribute('autocomplete')).toBe('new-password')
    expect(password.getAttribute('passwordrules')).toBe('minlength: 8;')
    expect(document.querySelector('input[name="email"]')!.getAttribute('autocomplete')).toBe('email')
    // The rule is shown before it's broken
    // ...and the field is described by it
    expect(password.getAttribute('aria-describedby')).toBe(screen.getByText('At least 8 characters').id)

    fireEvent.change(password, { target: { value: 'demo-password' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }))

    await waitFor(() =>
      expect(emailSignUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'demo@example.com', password: 'demo-password', name: 'demo' }),
      ),
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(addPasskey).not.toHaveBeenCalledWith(expect.objectContaining({ context: expect.anything() }))
  })

  describe("Chrome's Email Verification Protocol", () => {
    const NONCE = 'v1.random.expiry.signature'
    const TOKEN = 'evt.jwt.signature~kb.jwt.signature'
    const tokenField = () => document.querySelector<HTMLInputElement>('input[autocomplete="email-verification-token"]')

    beforeEach(() => {
      evpNonce.mockResolvedValue({
        data: { nonce: NONCE, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
        error: null,
      })
    })

    it('has no token field until the visitor switches to sign-up, then one with a fresh nonce in the form', async () => {
      render(<LoginForm />)
      expect(tokenField()).toBeNull()
      expect(evpNonce).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
      await waitFor(() => expect(tokenField()).not.toBeNull())
      const field = tokenField()!
      expect(field.type).toBe('hidden')
      expect(field.getAttribute('nonce')).toBe(NONCE)
      expect(field.form).toBe(screen.getByRole('form'))
      expect(evpNonce).toHaveBeenCalledOnce()
    })

    it('sets the nonce attribute only once the field is in the document (survives CSP nonce hiding)', async () => {
      const nonceWrites: { value: string; connected: boolean }[] = []
      const setAttribute = Element.prototype.setAttribute
      const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name, value) {
        if (name === 'nonce' && this.getAttribute('autocomplete') === 'email-verification-token') {
          nonceWrites.push({ value, connected: this.isConnected })
        }
        setAttribute.call(this, name, value)
      })
      try {
        render(<LoginForm />)
        fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
        await waitFor(() => expect(tokenField()).not.toBeNull())
      } finally {
        spy.mockRestore()
      }

      expect(nonceWrites.length).toBeGreaterThan(0)
      expect(nonceWrites.every(({ value, connected }) => value === NONCE && connected)).toBe(true)
      expect(tokenField()!.getAttribute('nonce')).toBe(NONCE)
    })

    it('sends the token Chrome filled in with a password sign-up', async () => {
      vi.stubGlobal('PublicKeyCredential', undefined)
      emailSignUp.mockResolvedValue({ error: null })
      render(<LoginForm />)
      fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
      await waitFor(() => expect(tokenField()).not.toBeNull())
      fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'demo@example.com' } })
      // What Chrome does as the form is submitted
      tokenField()!.value = TOKEN
      fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
      await screen.findByRole('button', { name: /Back to all sign-in options/ })
      fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'demo-password' } })
      fireEvent.click(await screen.findByRole('button', { name: 'Create account' }))

      await waitFor(() =>
        expect(emailSignUp).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'demo@example.com',
            emailVerificationToken: TOKEN,
            emailVerificationNonce: NONCE,
          }),
        ),
      )
    })

    it('verifies a passkey sign-up with the token once the account exists', async () => {
      vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
      addPasskey.mockResolvedValue({ data: {}, error: null })
      render(<LoginForm />)
      fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
      await waitFor(() => expect(tokenField()).not.toBeNull())
      await continueWithEmail()
      tokenField()!.value = TOKEN
      fireEvent.click(await screen.findByRole('button', { name: 'Create a passkey' }))

      await waitFor(() => expect(evpVerify).toHaveBeenCalledWith({ token: TOKEN, nonce: NONCE }))
      expect(addPasskey.mock.invocationCallOrder[0]).toBeLessThan(evpVerify.mock.invocationCallOrder[0]!)
    })

    it('signs up as before without a token, or when the backend has no nonce to give', async () => {
      vi.stubGlobal('PublicKeyCredential', undefined)
      emailSignUp.mockResolvedValue({ error: null })
      evpNonce.mockRejectedValue(new Error('offline'))
      render(<LoginForm />)
      fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
      await continueWithEmail()
      fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'demo-password' } })
      fireEvent.click(await screen.findByRole('button', { name: 'Create account' }))

      await waitFor(() => expect(emailSignUp).toHaveBeenCalled())
      expect(emailSignUp.mock.calls[0]![0]).not.toHaveProperty('emailVerificationToken')
      expect(tokenField()).toBeNull()
    })
  })

  it('asks for a password straight away in a browser without passkeys', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
    await continueWithEmail()

    expect(screen.getByLabelText(/^Password/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use a passkey instead' })).toBeNull()
  })

  it('starts conditional passkey autofill when the login form opens', async () => {
    const isConditionalMediationAvailable = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('PublicKeyCredential', { isConditionalMediationAvailable })

    render(<LoginForm />)
    expect(passkeySignIn).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(isConditionalMediationAvailable).toHaveBeenCalledOnce()
      expect(passkeySignIn).toHaveBeenCalledWith({ autoFill: true })
    })
  })

  it('reports a conditional passkey sign-in in the language switched to while it was pending', async () => {
    vi.stubGlobal('PublicKeyCredential', { isConditionalMediationAvailable: vi.fn().mockResolvedValue(true) })
    let finish: (value: { error: null }) => void = () => {}
    passkeySignIn.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const SwitchToJapanese = () => {
      const setLocale = useSetLocale()
      return (
        <button type="button" onClick={() => void setLocale('ja')}>
          switch
        </button>
      )
    }
    render(
      <LocaleProvider initialLocale="en">
        <SwitchToJapanese />
        <LoginForm />
      </LocaleProvider>,
    )
    await waitFor(() => expect(passkeySignIn).toHaveBeenCalledWith({ autoFill: true }))

    fireEvent.click(screen.getByRole('button', { name: 'switch' }))
    await screen.findByRole('button', { name: m.auth_form_continueWithEmail({}, { locale: 'ja' }) })
    finish({ error: null })

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(m.auth_login_toastSuccess({}, { locale: 'ja' })))
    // Switching the language must not start another autofill request
    expect(passkeySignIn).toHaveBeenCalledOnce()
  })

  it('cancels the pending autofill request when the form switches to sign-up', async () => {
    vi.stubGlobal('PublicKeyCredential', { isConditionalMediationAvailable: vi.fn().mockResolvedValue(true) })
    passkeySignIn.mockReturnValue(new Promise(() => {}))

    render(<LoginForm />)
    await waitFor(() => expect(passkeySignIn).toHaveBeenCalledWith({ autoFill: true }))
    expect(cancelCeremony).not.toHaveBeenCalled()

    // Left pending, the request surfaced as a "Use a saved passkey" dialog when the sign-up form was submitted
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Create one" }))
    expect(cancelCeremony).toHaveBeenCalledOnce()
  })

  it('keeps explicit passkey sign-in as a fallback', async () => {
    const isConditionalMediationAvailable = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('PublicKeyCredential', { isConditionalMediationAvailable })

    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with passkey' }))

    await waitFor(() => expect(passkeySignIn).toHaveBeenCalledWith())
  })
})