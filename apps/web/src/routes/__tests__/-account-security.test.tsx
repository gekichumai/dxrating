import { act, render, screen } from '@testing-library/react'
import { useEffect, useSyncExternalStore } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface SessionState {
  data: { session: { token: string } } | null
  isPending: boolean
}

// Better Auth's session atom, reduced to what the page reads, so the test can play its refetches
const session = vi.hoisted(() => {
  let state: SessionState = { data: null, isPending: true }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set: (next: SessionState) => {
      state = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
})

const mounts = vi.hoisted(() => ({ loginForm: 0 }))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => useSyncExternalStore(session.subscribe, session.get, session.get),
  },
}))

vi.mock('@/components/auth/LoginForm', () => ({
  LoginForm: () => {
    useEffect(() => {
      mounts.loginForm += 1
    }, [])
    return <div>sign-in form</div>
  },
}))

vi.mock('@/components/global/preferences/SecuritySection', () => ({
  SecuritySection: () => <div>security settings</div>,
}))

const renderPage = async () => {
  // Each test starts a fresh page load: the "loaded once" latch lives in the module
  vi.resetModules()
  const { Route } = await import('../account/security')
  const Page = Route.options.component!
  return render(<Page />)
}

const loading = () => screen.queryByRole('progressbar')

describe('/account/security', () => {
  beforeEach(() => {
    mounts.loginForm = 0
    session.set({ data: null, isPending: true })
  })

  it('shows its loading state while the session first loads', async () => {
    await renderPage()
    expect(loading()).not.toBeNull()
    expect(screen.queryByText('sign-in form')).toBeNull()

    act(() => session.set({ data: null, isPending: false }))
    expect(loading()).toBeNull()
    expect(screen.getByText('sign-in form')).not.toBeNull()
  })

  it('keeps the sign-in form mounted while the session refetches after a failed passkey autofill', async () => {
    await renderPage()
    act(() => session.set({ data: null, isPending: false }))
    expect(mounts.loginForm).toBe(1)

    // verify-authentication answered 401; the passkey client raised $sessionSignal and the session refetches, which
    // Better Auth reports as pending again while there is no session
    act(() => session.set({ data: null, isPending: true }))
    expect(loading()).toBeNull()
    expect(screen.getByText('sign-in form')).not.toBeNull()
    act(() => session.set({ data: null, isPending: false }))

    expect(mounts.loginForm).toBe(1)
  })

  it('shows the settings once a refetch finds a session', async () => {
    await renderPage()
    act(() => session.set({ data: null, isPending: false }))
    act(() => session.set({ data: null, isPending: true }))
    act(() => session.set({ data: { session: { token: 't' } }, isPending: false }))
    expect(screen.getByText('security settings')).not.toBeNull()
    expect(loading()).toBeNull()
  })
})