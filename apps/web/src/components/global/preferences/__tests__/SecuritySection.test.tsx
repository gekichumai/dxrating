import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { LocaleProvider, useSetLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { SecuritySection } from '../SecuritySection'

const { addPasskey, changePassword, listUserPasskeys, listSessions } = vi.hoisted(() => ({
  addPasskey: vi.fn(),
  changePassword: vi.fn(),
  listUserPasskeys: vi.fn(),
  listSessions: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    changePassword,
    listSessions,
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
    changePassword.mockResolvedValue({ error: null })
    listUserPasskeys.mockResolvedValue({ data: [] })
    listSessions.mockResolvedValue({ data: [] })
  })

  it('uses a semantic password form with stable password-manager fields', async () => {
    render(<SecuritySection />, { wrapper: TestProviders })

    const form = screen.getByRole('form', { name: 'Password' })
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
        <SecuritySection />
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