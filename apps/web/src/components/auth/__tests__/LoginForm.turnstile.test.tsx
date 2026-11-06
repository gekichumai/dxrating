import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'

// The site key is read when LoginForm's module loads, so stub it before importing the form
vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')

const { emailSignIn, widget, page } = vi.hoisted(() => ({
  emailSignIn: vi.fn(),
  page: { theme: 'light' as 'light' | 'dark' },
  widget: {
    onSuccess: undefined as ((token: string) => void) | undefined,
    theme: undefined as string | undefined,
    size: undefined as string | undefined,
  },
}))

// A controllable matchMedia: `narrow` decides whether max-width queries match, and flipping it notifies listeners the
// way a real viewport resize across the breakpoint would
const viewport = { narrow: false, listeners: new Set<() => void>() }
function setNarrow(narrow: boolean) {
  viewport.narrow = narrow
  for (const listener of viewport.listeners) listener()
}
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    get matches() {
      return query.includes('max-width') && viewport.narrow
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => viewport.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => viewport.listeners.delete(listener),
    addListener: (listener: () => void) => viewport.listeners.add(listener),
    removeListener: (listener: () => void) => viewport.listeners.delete(listener),
    dispatchEvent: () => false,
  }),
})

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

// The real wrapper removes and re-renders the widget when options.theme or options.size changes; record what it was given
vi.mock('@marsidev/react-turnstile', () => {
  return {
    Turnstile: function Turnstile(props: {
      onSuccess: (token: string) => void
      options: { theme: string; size: string }
    }) {
      widget.onSuccess = props.onSuccess
      widget.theme = props.options.theme
      widget.size = props.options.size
      return <div data-testid="turnstile" data-theme={props.options.theme} data-size={props.options.size} />
    },
  }
})

describe('LoginForm Turnstile across a widget replacement', () => {
  beforeAll(() => {
    initI18n()
  })
  afterEach(() => {
    page.theme = 'light'
    viewport.narrow = false
    viewport.listeners.clear()
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

  it('drops the old widget token when the viewport crosses the compact breakpoint and submits the replacement token', async () => {
    emailSignIn.mockResolvedValue({ error: null })
    const { LoginForm } = await import('../LoginForm')
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'demo@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'demo-password' } })
    const submit = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]') as HTMLButtonElement

    expect(widget.size).toBe('flexible')
    act(() => widget.onSuccess?.('flexible-token'))

    // The viewport narrows: the widget is recreated compact and the flexible widget's token must not be submitted
    act(() => setNarrow(true))
    expect(widget.size).toBe('compact')
    fireEvent.click(submit())
    await screen.findByText(/security check/i)
    expect(emailSignIn).not.toHaveBeenCalled()

    act(() => widget.onSuccess?.('compact-token'))
    fireEvent.click(submit())

    await waitFor(() => expect(emailSignIn).toHaveBeenCalledTimes(1))
    expect(emailSignIn.mock.calls[0][0].fetchOptions).toEqual({ headers: { 'x-captcha-response': 'compact-token' } })
  })
})