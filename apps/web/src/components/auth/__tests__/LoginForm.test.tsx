import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { LoginForm } from '../LoginForm'

const { passkeySignIn, emailSignIn, socialSignIn, emailSignUp } = vi.hoisted(() => ({
  passkeySignIn: vi.fn(),
  emailSignIn: vi.fn(),
  socialSignIn: vi.fn(),
  emailSignUp: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getLastUsedLoginMethod: () => null,
    signIn: {
      email: emailSignIn,
      passkey: passkeySignIn,
      social: socialSignIn,
    },
    signUp: {
      email: emailSignUp,
    },
  },
}))

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

vi.mock('@marsidev/react-turnstile', async () => {
  const { forwardRef } = await import('react')
  return {
    Turnstile: forwardRef(function Turnstile() {
      return <div data-testid="turnstile" />
    }),
  }
})

describe('LoginForm', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    passkeySignIn.mockResolvedValue({ error: null })
  })

  it('uses browser-native sign-in semantics and reveals the password on request', () => {
    render(<LoginForm />)

    const form = screen.getByRole('form', { name: 'Sign in' })
    const email = screen.getByLabelText(/^Email/)
    const password = screen.getByLabelText(/^Password/)
    const submit = screen.getByRole('button', { name: 'Continue' })

    expect(form.tagName).toBe('FORM')
    expect(email.getAttribute('id')).toBe('auth-sign-in-email')
    expect(email.getAttribute('name')).toBe('email')
    expect(email.getAttribute('type')).toBe('email')
    expect(email.getAttribute('autocomplete')).toBe('username webauthn')
    expect(email.hasAttribute('required')).toBe(true)
    expect(password.getAttribute('id')).toBe('auth-sign-in-password')
    expect(password.getAttribute('name')).toBe('password')
    expect(password.getAttribute('type')).toBe('password')
    expect(password.getAttribute('autocomplete')).toBe('current-password webauthn')
    expect(password.hasAttribute('required')).toBe(true)
    expect(submit.getAttribute('type')).toBe('submit')

    fireEvent.click(screen.getByRole('button', { name: 'Show Password' }))

    expect(password.getAttribute('type')).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide Password' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('switches to one registration form without leaving duplicate controls mounted', () => {
    render(<LoginForm />)

    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }))

    expect(screen.getAllByRole('form')).toHaveLength(1)
    expect(screen.getAllByLabelText(/^Email/)).toHaveLength(1)
    expect(screen.getAllByLabelText(/^Password/)).toHaveLength(1)
    expect(screen.getAllByTestId('turnstile')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Sign in with Passkey' })).toBeNull()
    expect(screen.getByLabelText(/^Email/).getAttribute('id')).toBe('auth-sign-up-email')
    expect(screen.getByLabelText(/^Email/).getAttribute('autocomplete')).toBe('email')
    expect(screen.getByLabelText(/^Password/).getAttribute('id')).toBe('auth-sign-up-password')
    expect(screen.getByLabelText(/^Password/).getAttribute('autocomplete')).toBe('new-password')
    expect(screen.getByRole('button', { name: 'Sign Up' }).getAttribute('type')).toBe('submit')
  })

  it('starts conditional passkey autofill when the browser supports it', async () => {
    const isConditionalMediationAvailable = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('PublicKeyCredential', { isConditionalMediationAvailable })

    render(<LoginForm />)

    await waitFor(() => {
      expect(isConditionalMediationAvailable).toHaveBeenCalledOnce()
      expect(passkeySignIn).toHaveBeenCalledWith({ autoFill: true })
    })
  })

  it('keeps explicit passkey sign-in as a fallback', async () => {
    const isConditionalMediationAvailable = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('PublicKeyCredential', { isConditionalMediationAvailable })

    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Passkey' }))

    await waitFor(() => expect(passkeySignIn).toHaveBeenCalledWith())
  })
})