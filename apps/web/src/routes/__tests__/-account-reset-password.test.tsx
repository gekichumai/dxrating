import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resetPassword, navigate } = vi.hoisted(() => ({ resetPassword: vi.fn(), navigate: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({ authClient: { resetPassword } }))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))

const renderPage = async (search: string) => {
  window.history.replaceState(null, '', `/account/reset-password${search}`)
  const { Route } = await import('../account/reset-password')
  const Page = Route.options.component!
  return render(<Page />)
}

const choose = (password: string, confirmation = password) => {
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: password } })
  fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: confirmation } })
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
}

describe('/account/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets the new password with the token, which leaves the address bar', async () => {
    resetPassword.mockResolvedValue({ data: { status: true }, error: null })
    await renderPage('?token=reset-token')
    expect(window.location.search).toBe('')

    choose('a-new-password')
    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({ newPassword: 'a-new-password', token: 'reset-token' }),
    )
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeTruthy()
  })

  it('checks the fields before sending anything', async () => {
    await renderPage('?token=reset-token')
    choose('short')
    expect(await screen.findByText('Use at least 8 characters for your password')).toBeTruthy()
    choose('a-new-password', 'another-password')
    expect(screen.getByText('Enter the same new password in both fields')).toBeTruthy()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it("shows the backend's reason a password was refused", async () => {
    resetPassword.mockResolvedValue({
      data: null,
      error: { code: 'PASSWORD_COMPROMISED', message: 'This password appeared in a known data breach', status: 400 },
    })
    await renderPage('?token=reset-token')
    choose('password1234')
    expect((await screen.findByRole('alert')).textContent).toBe('This password appeared in a known data breach')
  })

  it('explains a link that does not work', async () => {
    await renderPage('?error=INVALID_TOKEN')
    expect(screen.getByRole('heading', { name: "This link doesn't work" })).toBeTruthy()
    expect(screen.queryByLabelText(/^New password/)).toBeNull()
  })

  it('explains a token that stopped working before the form was sent', async () => {
    resetPassword.mockResolvedValue({ data: null, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } })
    await renderPage('?token=used-token')
    choose('a-new-password')
    expect(await screen.findByRole('heading', { name: "This link doesn't work" })).toBeTruthy()
  })
})