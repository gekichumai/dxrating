import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { LocaleProvider, useSetLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { SecuritySection } from '../SecuritySection'

const {
  addPasskey,
  changePassword,
  listAccounts,
  listUserPasskeys,
  listSessions,
  sendVerificationEmail,
  setInitialPassword,
} = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
  addPasskey: vi.fn(),
  changePassword: vi.fn(),
  listAccounts: vi.fn(),
  listUserPasskeys: vi.fn(),
  listSessions: vi.fn(),
  setInitialPassword: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    changePassword,
    listAccounts,
    listSessions,
    sendVerificationEmail,
    setInitialPassword,
    passkey: {
      addPasskey,
      deletePasskey: vi.fn(),
      listUserPasskeys,
    },
    revokeSession: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function TestProviders({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('SecuritySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_AUTH_MAIL_ENABLED', 'true')
    changePassword.mockResolvedValue({ error: null })
    listAccounts.mockResolvedValue({ data: [{ id: 'a1', providerId: 'credential', accountId: 'u1' }], error: null })
    setInitialPassword.mockResolvedValue({ data: { status: true }, error: null })
    listUserPasskeys.mockResolvedValue({ data: [] })
    listSessions.mockResolvedValue({ data: [] })
  })

  it('shows whether the address is verified, and resends the link for one that is not', async () => {
    sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null })
    const { rerender } = render(
      <SecuritySection userId="u1" email={{ address: 'player@example.com', verified: false }} />,
      { wrapper: TestProviders },
    )
    const email = screen.getByRole('region', { name: 'Email address' })
    expect(email.textContent).toContain('player@example.com')
    expect(email.textContent).toContain('Not verified')

    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledWith({ email: 'player@example.com' }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Email sent. Open the link in it to verify your address.'),
    )

    rerender(<SecuritySection userId="u1" email={{ address: 'player@example.com', verified: true }} />)
    expect(screen.getByRole('region', { name: 'Email address' }).textContent).toContain('Verified')
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull()
  })

  it('says when verification mail is off', async () => {
    sendVerificationEmail.mockResolvedValue({
      data: null,
      error: { code: 'VERIFICATION_EMAIL_NOT_ENABLED', message: "Verification email isn't enabled", status: 400 },
    })
    render(<SecuritySection userId="u1" email={{ address: 'player@example.com', verified: false }} />, {
      wrapper: TestProviders,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Verification email isn't available right now."))
  })

  it('shows the address alone, with no verification to chase, in a build without account email', () => {
    vi.stubEnv('VITE_AUTH_MAIL_ENABLED', '')
    const { rerender } = render(
      <SecuritySection userId="u1" email={{ address: 'player@example.com', verified: false }} />,
      { wrapper: TestProviders },
    )
    const email = screen.getByRole('region', { name: 'Email address' })
    expect(email.textContent).toContain('player@example.com')
    expect(email.textContent).not.toContain('Not verified')
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull()

    rerender(<SecuritySection userId="u1" email={{ address: 'player@example.com', verified: true }} />)
    expect(screen.getByRole('region', { name: 'Email address' }).textContent).toContain('Verified')
  })

  it('uses a semantic password form with stable password-manager fields', async () => {
    render(<SecuritySection userId="u1" />, { wrapper: TestProviders })

    const form = await screen.findByRole('form', { name: 'Password' })
    const currentPassword = screen.getByLabelText(/^Current password/)
    const newPassword = screen.getByLabelText(/^New password/)
    const confirmPassword = screen.getByLabelText(/^Confirm new password/)

    expect(currentPassword.getAttribute('id')).toBe('security-current-password')
    expect(currentPassword.getAttribute('name')).toBe('current-password')
    expect(currentPassword.getAttribute('autocomplete')).toBe('current-password')
    expect(currentPassword.hasAttribute('required')).toBe(true)
    expect(newPassword.getAttribute('id')).toBe('security-new-password')
    expect(newPassword.getAttribute('name')).toBe('new-password')
    expect(newPassword.getAttribute('autocomplete')).toBe('new-password')
    expect(confirmPassword.getAttribute('id')).toBe('security-confirm-password')
    expect(confirmPassword.getAttribute('name')).toBe('confirm-password')
    expect(confirmPassword.getAttribute('autocomplete')).toBe('new-password')
    expect(screen.getByRole('button', { name: 'Change password' }).getAttribute('type')).toBe('submit')

    fireEvent.click(screen.getByRole('button', { name: 'Show Current password' }))
    expect(currentPassword.getAttribute('type')).toBe('text')

    fireEvent.change(currentPassword, { target: { value: 'old-password' } })
    fireEvent.change(newPassword, { target: { value: 'new-password' } })
    fireEvent.change(confirmPassword, { target: { value: 'new-password' } })
    fireEvent.submit(form)

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password',
        newPassword: 'new-password',
        revokeOtherSessions: true,
      }),
    )
  })

  it('offers an account without a password to set one, with no current password to give', async () => {
    // A passkey-only account: no credential account (passkeys aren't accounts)
    listAccounts.mockResolvedValue({ data: [], error: null })
    render(<SecuritySection userId="u1" />, { wrapper: TestProviders })

    const form = await screen.findByRole('form', { name: 'Password' })
    expect(screen.queryByLabelText(/^Current password/)).toBeNull()
    expect(form.getAttribute('aria-describedby')).toBe('security-password-settings-description')
    expect(screen.getByText(m.auth_userProfile_password_setDescription({}, { locale: 'en' }))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull()

    // Too short: refused before anything is sent
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: 'short' } })
    fireEvent.submit(form)
    expect(await screen.findByText(m.auth_form_validation_passwordMinLength({}, { locale: 'en' }))).toBeTruthy()
    expect(setInitialPassword).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'first-password' } })
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: 'first-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    await waitFor(() => expect(setInitialPassword).toHaveBeenCalledWith({ newPassword: 'first-password' }))
    expect(changePassword).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith(m.auth_userProfile_password_setSuccess({}, { locale: 'en' }))
    // Now it has one: changing it asks for it
    expect(await screen.findByLabelText(/^Current password/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change password' })).toBeTruthy()
  })

  it("never shows the last account's password form to the next one signed in on the same page", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { rerender } = render(<SecuritySection userId="u1" />, { wrapper: Shared })
    expect(await screen.findByLabelText(/^Current password/)).toBeTruthy()

    // Signed out, then in as a passkey-only account, whose accounts answer slowly
    let answer: (value: unknown) => void = () => {}
    listAccounts.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    rerender(<SecuritySection userId="u2" />)
    expect(screen.queryByLabelText(/^Current password/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull()

    answer({ data: [], error: null })
    expect(await screen.findByRole('button', { name: 'Set password' })).toBeTruthy()
    expect(screen.queryByLabelText(/^Current password/)).toBeNull()
  })

  it('shows why a password could not be set, in the server language', async () => {
    listAccounts.mockResolvedValue({ data: [], error: null })
    setInitialPassword.mockResolvedValue({
      data: null,
      error: { code: 'SESSION_NOT_FRESH', message: 'Sign in again first', status: 403, statusText: 'FORBIDDEN' },
    })
    render(<SecuritySection userId="u1" />, { wrapper: TestProviders })

    await screen.findByRole('form', { name: 'Password' })
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'first-password' } })
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: 'first-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        m.auth_userProfile_password_setError({ error: 'Sign in again first' }, { locale: 'en' }),
      ),
    )
    expect(screen.getByRole('button', { name: 'Set password' })).toBeTruthy()
  })

  it('reports account actions in the language switched to after mounting', async () => {
    addPasskey.mockResolvedValue({ error: null })
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
        <SecuritySection userId="u1" />
      </LocaleProvider>,
      { wrapper: TestProviders },
    )

    fireEvent.click(screen.getByRole('button', { name: 'switch' }))
    fireEvent.click(await screen.findByRole('button', { name: m.auth_userProfile_passkeys_add({}, { locale: 'ja' }) }))

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(m.auth_userProfile_passkeys_added({}, { locale: 'ja' })),
    )
  })
})