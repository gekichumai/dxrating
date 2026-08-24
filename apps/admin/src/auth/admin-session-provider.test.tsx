import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AdminAuthClient, AdminSessionSnapshot } from './admin-auth-client'
import { AdminSessionProvider, useAdminSession } from './admin-session-provider'

const refetch = vi.fn(async () => undefined)

const pendingSession = (): AdminSessionSnapshot => ({
  data: null,
  error: null,
  isPending: true,
  isRefetching: false,
  refetch,
})

const createClient = (readSession: () => AdminSessionSnapshot): AdminAuthClient => ({
  beginSocialSignIn: vi.fn(),
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  useSession: readSession,
})

const SessionProbe = () => {
  const session = useAdminSession()
  if (session.status === 'authenticated') {
    return <output>{`authenticated:${session.identity.user.email}`}</output>
  }
  if (session.status === 'unavailable') {
    return <output>{`unavailable:${session.failure.kind}`}</output>
  }
  return <output>{session.status}</output>
}

describe('administrator session provider', () => {
  it('publishes session transitions and notifies each authoritative state once', async () => {
    let snapshot = pendingSession()
    const client = createClient(() => snapshot)
    const onSessionAvailable = vi.fn()
    const onSessionMissing = vi.fn()
    const onSessionUnavailable = vi.fn()

    const renderProvider = () => (
      <AdminSessionProvider
        client={client}
        onSessionAvailable={onSessionAvailable}
        onSessionMissing={onSessionMissing}
        onSessionUnavailable={onSessionUnavailable}
      >
        <SessionProbe />
      </AdminSessionProvider>
    )

    const rendered = render(renderProvider())
    expect(screen.getByText('pending')).toBeTruthy()
    expect(onSessionAvailable).not.toHaveBeenCalled()
    expect(onSessionMissing).not.toHaveBeenCalled()

    snapshot = {
      data: {
        sessionId: 'session-id',
        user: {
          email: 'administrator@example.com',
          id: 'administrator-id',
          image: null,
          name: 'Administrator',
        },
      },
      error: null,
      isPending: false,
      isRefetching: false,
      refetch,
    }
    rendered.rerender(renderProvider())
    expect(screen.getByText('authenticated:administrator@example.com')).toBeTruthy()
    await vi.waitFor(() => expect(onSessionAvailable).toHaveBeenCalledOnce())

    rendered.rerender(renderProvider())
    expect(onSessionAvailable).toHaveBeenCalledOnce()

    snapshot = {
      data: null,
      error: null,
      isPending: false,
      isRefetching: false,
      refetch,
    }
    rendered.rerender(renderProvider())
    expect(screen.getByText('unauthenticated')).toBeTruthy()
    await vi.waitFor(() => expect(onSessionMissing).toHaveBeenCalledOnce())

    snapshot = {
      data: null,
      error: { kind: 'unavailable', operation: 'session' },
      isPending: false,
      isRefetching: false,
      refetch,
    }
    rendered.rerender(renderProvider())
    expect(screen.getByText('unavailable:unavailable')).toBeTruthy()
    await vi.waitFor(() =>
      expect(onSessionUnavailable).toHaveBeenCalledWith({
        kind: 'unavailable',
        operation: 'session',
      }),
    )
  })

  it('fails loudly when a consumer is rendered outside the provider', () => {
    expect(() => render(<SessionProbe />)).toThrow('useAdminSession must be used inside AdminSessionProvider')
  })
})