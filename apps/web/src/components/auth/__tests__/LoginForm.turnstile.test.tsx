import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'

// The site key is read when LoginForm's module loads, so stub it before importing the form
vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')

const { emailSignIn, widget, page } = vi.hoisted(() => ({
  emailSignIn: vi.fn(),
  page: { theme: 'light' as 'light' | 'dark' },
  widget: { onSuccess: undefined as ((token: string) => void) | undefined, theme: undefined as string | undefined },
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getLastUsedLoginMethod: () => null,
    signIn: { email: emailSignIn, passkey: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
  },
}))
// The page theme (useResolvedTheme has its own tests); this file is about the token lifecycle
vi.mock('@/utils/useResolvedTheme', () => ({ useResolvedTheme: () => page.theme }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('web-haptics/react', () => ({ useWebHaptics: () => ({ trigger: vi.fn() }) }))

// The real wrapper removes and re-renders the widget when options.theme changes; record what it was given
vi.mock('@marsidev/react-turnstile', () => {
  return {
    Turnstile: function Turnstile(props: { onSuccess: (token: string) => void; options: { theme: string } }) {
      widget.onSuccess = props.onSuccess
      widget.theme = props.options.theme
      return <div data-testid="turnstile" data-theme={props.options.theme} />
    },
  }
})

describe('LoginForm Turnstile across a theme change', () => {
  beforeAll(() => {
    initI18n()
  })
  afterEach(() => {
    page.theme = 'light'
    vi.clearAllMocks()
  })

  it('drops the old widget token when the theme recreates the widget and submits the replacement token', async () => {
    emailSignIn.mockResolvedValue({ error: null })
    const { LoginForm } = await import('../LoginForm')
    const { rerender } = render(<LoginForm />)

    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'demo@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'demo-password' } })
    const submit = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]') as HTMLButtonElement

    expect(widget.theme).toBe('light')
    act(() => widget.onSuccess?.('light-token'))

    // The theme changes: the widget is recreated dark and the light widget's token must not be submitted
    page.theme = 'dark'
    rerender(<LoginForm />)
    expect(widget.theme).toBe('dark')
    // Submit stays enabled (validation happens on submit), but without a token from the new widget nothing is sent
    fireEvent.click(submit())
    await screen.findByText(/security check/i)
    expect(emailSignIn).not.toHaveBeenCalled()

    act(() => widget.onSuccess?.('dark-token'))
    fireEvent.click(submit())

    await waitFor(() => expect(emailSignIn).toHaveBeenCalledTimes(1))
    expect(emailSignIn.mock.calls[0][0].fetchOptions).toEqual({ headers: { 'x-captcha-response': 'dark-token' } })
  })
})