import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({ authClient: { useSession } }))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

const renderPage = async (search: string, session: { emailVerified: boolean } | null) => {
  useSession.mockReturnValue({ data: session ? { user: session } : null, isPending: false })
  window.history.replaceState(null, '', `/account/verify-email${search}`)
  const { Route } = await import('../account/verify-email')
  const Page = Route.options.component!
  return render(<Page />)
}

describe('/account/verify-email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows success when the session that opened the link is now verified', async () => {
    await renderPage('', { emailVerified: true })
    expect(screen.getByRole('heading', { name: 'Email address verified' })).toBeTruthy()
  })

  it('claims nothing when opened without an outcome (a bookmark, history, a reload)', async () => {
    await renderPage('', null)
    expect(screen.getByRole('heading', { name: 'Nothing to show' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Email address verified' })).toBeNull()
  })

  it('asks to sign in when the link was opened without a session of its account', async () => {
    await renderPage('?error=SESSION_REQUIRED', null)
    expect(screen.getByRole('heading', { name: 'Sign in to verify' })).toBeTruthy()
  })
})