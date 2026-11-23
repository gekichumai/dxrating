import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { m } from '@/paraglide/messages'
import { useAuth } from '../useAuth'

const { passkeySignIn } = vi.hoisted(() => ({ passkeySignIn: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    getLastUsedLoginMethod: () => null,
    signIn: { passkey: passkeySignIn, email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
  },
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('web-haptics/react', () => ({ useWebHaptics: () => ({ trigger: vi.fn() }) }))

const Host = () => {
  const { openLoginDialog, LoginDialog } = useAuth()
  return (
    <>
      <button type="button" onClick={openLoginDialog}>
        open
      </button>
      <LoginDialog />
    </>
  )
}

describe('useAuth login dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('PublicKeyCredential', { isConditionalMediationAvailable: vi.fn().mockResolvedValue(true) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the form mounted while a passkey sign-in is pending, so no autofill request cancels it', async () => {
    // The autofill request stays open (the user hasn't picked a suggestion); the button's request waits on the user
    passkeySignIn.mockImplementation(() => new Promise(() => {}))
    render(<Host />)

    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(passkeySignIn).toHaveBeenCalledWith({ autoFill: true }))
    const form = screen.getByRole('form')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: m.auth_form_signInWithPasskey({}, { locale: 'en' }) }))
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    // A remount would replace the form and start a second autofill request, which aborts the pending ceremony
    expect(screen.getByRole('form')).toBe(form)
    expect(passkeySignIn.mock.calls).toEqual([[{ autoFill: true }], []])
    expect(
      screen
        .getByRole('button', { name: m.auth_form_signInWithPasskey({}, { locale: 'en' }) })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('opens through the hook without changing the dialog component', () => {
    const types: unknown[] = []
    const Probe = () => {
      const { openLoginDialog, LoginDialog } = useAuth()
      types.push(LoginDialog)
      return (
        <>
          <button type="button" onClick={openLoginDialog}>
            open
          </button>
          <LoginDialog />
        </>
      )
    }
    passkeySignIn.mockImplementation(() => new Promise(() => {}))
    render(<Probe />)

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(new Set(types).size).toBe(1)
  })
})