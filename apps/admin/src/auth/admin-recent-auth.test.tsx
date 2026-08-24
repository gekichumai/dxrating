import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createAdminDataClient } from '../data/admin-client'
import { AdminDataProvider } from '../data/admin-data-context'
import { createAdminTestQueryClient } from '../data/query-client'
import { adminQueryKeys } from '../data/query-keys'
import { TranslationProvider } from '../i18n'
import { createAdminAuthController } from './admin-auth-controller'
import { AdminAuthProvider, type AdminAuthActions, type AdminAuthSnapshot } from './admin-auth-context'
import {
  ADMIN_RECENT_AUTH_MAX_AGE_MS,
  AdminRecentAuthProvider,
  isAdminRecentAuthValid,
  normalizeAdminPrimaryAuthOauthUrl,
  useAdminRecentAuth,
  type AdminRecentAuthLabels,
} from './admin-recent-auth'

const labels: AdminRecentAuthLabels = {
  cancel: 'Cancel verification',
  description: 'Confirm your identity before continuing.',
  googleSubmit: 'Verify with Google',
  or: 'or',
  passwordLabel: 'Current password',
  passwordSubmit: 'Verify password',
  title: 'Verify identity',
}

const authenticated: AdminAuthSnapshot = {
  status: 'authenticated',
  principal: {
    userId: 'admin-user-id',
    effectiveRole: 'admin',
    capabilities: {
      canManageAdministrators: false,
      canModerateAdministrators: false,
      canModerateUsers: true,
    },
  },
}

const RequestProbe = () => {
  const recentAuth = useAdminRecentAuth()
  const [outcome, setOutcome] = useState('not requested')

  return (
    <div>
      <span>{recentAuth.hasValidRecentAuth() ? 'window valid' : 'window unavailable'}</span>
      <button
        onClick={() => {
          void recentAuth.requestRecentAuth().then((verified) => setOutcome(verified ? 'verified' : 'cancelled'))
        }}
        type="button"
      >
        Request verification
      </button>
      <output>{outcome}</output>
    </div>
  )
}

const createHarness = ({
  auth = authenticated,
  actions,
  children = <RequestProbe />,
  fetch,
  navigateToOauth,
  now,
}: {
  readonly auth?: AdminAuthSnapshot
  readonly actions?: AdminAuthActions
  readonly children?: ReactNode
  readonly fetch: typeof globalThis.fetch
  readonly navigateToOauth?: (url: string) => void
  readonly now?: () => number
}) => {
  const data = createAdminDataClient({
    backendOrigin: 'https://api.dxrating.test',
    fetch,
    mode: 'test',
  })
  const queryClient = createAdminTestQueryClient()

  const Harness = ({ authSnapshot }: { readonly authSnapshot: AdminAuthSnapshot }) => (
    <TranslationProvider>
      <MantineProvider>
        <QueryClientProvider client={queryClient}>
          <AdminDataProvider value={data}>
            <AdminAuthProvider actions={actions} value={authSnapshot}>
              <AdminRecentAuthProvider labels={labels} navigateToOauth={navigateToOauth} now={now}>
                {children}
              </AdminRecentAuthProvider>
            </AdminAuthProvider>
          </AdminDataProvider>
        </QueryClientProvider>
      </MantineProvider>
    </TranslationProvider>
  )

  return { Harness, queryClient, rendered: render(<Harness authSnapshot={auth} />) }
}

describe('recent primary-authentication validity', () => {
  const observedAt = Date.parse('2026-08-24T12:00:00.000Z')

  it('fails closed without a complete active server observation', () => {
    expect(isAdminRecentAuthValid({ observedAt, status: undefined }, observedAt)).toBe(false)
    expect(isAdminRecentAuthValid({ observedAt, status: { active: false, expiresAt: null } }, observedAt)).toBe(false)
    expect(isAdminRecentAuthValid({ observedAt, status: { active: true, expiresAt: null } }, observedAt)).toBe(false)
    expect(isAdminRecentAuthValid({ observedAt, status: { active: true, expiresAt: 'not-a-date' } }, observedAt)).toBe(
      false,
    )
  })

  it('uses the earlier of server expiry and the ten-minute client cap', () => {
    const serverExpiry = new Date(observedAt + 60 * 60 * 1_000).toISOString()
    const observation = { observedAt, status: { active: true, expiresAt: serverExpiry } }

    expect(isAdminRecentAuthValid(observation, observedAt + ADMIN_RECENT_AUTH_MAX_AGE_MS - 1)).toBe(true)
    expect(isAdminRecentAuthValid(observation, observedAt + ADMIN_RECENT_AUTH_MAX_AGE_MS)).toBe(false)

    const earlierServerExpiry = new Date(observedAt + 30_000).toISOString()
    expect(
      isAdminRecentAuthValid(
        { observedAt, status: { active: true, expiresAt: earlierServerExpiry } },
        observedAt + 30_000,
      ),
    ).toBe(false)
  })

  it('accepts only the exact credential-free Google HTTPS origin', () => {
    expect(normalizeAdminPrimaryAuthOauthUrl('https://accounts.google.com/o/oauth2/v2/auth?state=opaque')).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?state=opaque',
    )
    expect(normalizeAdminPrimaryAuthOauthUrl('http://accounts.google.com/auth')).toBeNull()
    expect(normalizeAdminPrimaryAuthOauthUrl('https://user:secret@accounts.google.com/auth')).toBeNull()
    expect(normalizeAdminPrimaryAuthOauthUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeAdminPrimaryAuthOauthUrl('not a URL')).toBeNull()
  })
})

describe('administrator recent-authentication provider', () => {
  it('completes password verification without retaining the credential in React Query', async () => {
    const now = Date.parse('2026-08-24T12:00:00.000Z')
    let requestBody: unknown
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const candidate = request as Request
      requestBody = await candidate.clone().json()
      return Response.json({ completed: true, expiresAt: new Date(now + 5 * 60_000).toISOString() })
    }) as unknown as typeof globalThis.fetch
    const user = userEvent.setup()
    const { queryClient } = createHarness({ fetch, now: () => now })

    await user.click(screen.getByRole('button', { name: 'Request verification' }))
    const password = await screen.findByLabelText(/Current password/)
    await user.type(password, 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: 'Verify password' }))

    expect(await screen.findByText('verified')).toBeTruthy()
    expect(screen.getByText('window valid')).toBeTruthy()
    expect(requestBody).toEqual({ password: 'correct horse battery staple' })
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('correct horse battery staple')
    expect(queryClient.getQueryData(adminQueryKeys.primaryAuth.status())).toEqual({
      active: true,
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    })
  })

  it('clears the password field after a typed failure and resolves only when the user cancels', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          defined: true,
          code: 'STEP_UP_FAILED',
          status: 401,
          message: 'server text must not be presentation copy',
          data: { requestId: null },
        },
        { status: 401 },
      ),
    ) as unknown as typeof globalThis.fetch
    const user = userEvent.setup()
    const { queryClient } = createHarness({ fetch })

    await user.click(screen.getByRole('button', { name: 'Request verification' }))
    const password = await screen.findByLabelText(/Current password/)
    await user.type(password, 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Verify password' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Identity confirmation failed')
    expect((screen.getByLabelText(/Current password/) as HTMLInputElement).value).toBe('')
    expect(screen.getByText('not requested')).toBeTruthy()
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain('wrong-password')

    await user.click(screen.getByRole('button', { name: 'Cancel verification' }))
    expect(await screen.findByText('cancelled')).toBeTruthy()
  })

  it.each([
    ['password', 'UNAUTHENTICATED', { status: 'unauthenticated', reason: 'expired-or-revoked' }],
    ['google', 'FRESH_LOGIN_REQUIRED', { status: 'fresh-login-required' }],
  ] as const)(
    'routes a direct %s authorization failure through the fail-closed controller',
    async (method, code, terminalState) => {
      const clearProtectedState = vi.fn(async () => undefined)
      const controller = createAdminAuthController({ clearProtectedState })
      const authorizationCheck = controller.beginAuthorizationCheck()!
      controller.markAuthenticated(authenticated.principal, authorizationCheck)
      const actions: AdminAuthActions = {
        reportFeatureError: controller.handleFeatureError,
        retry: async () => undefined,
        signOut: async () => undefined,
      }
      const fetch = vi.fn(async () =>
        Response.json(
          {
            defined: true,
            code,
            status: 401,
            message: 'sensitive authorization detail',
            data: { requestId: null },
          },
          { status: 401 },
        ),
      ) as unknown as typeof globalThis.fetch
      const user = userEvent.setup()
      createHarness({ actions, fetch })

      await user.click(screen.getByRole('button', { name: 'Request verification' }))
      if (method === 'password') {
        await user.type(await screen.findByLabelText(/Current password/), 'must-not-persist')
        await user.click(screen.getByRole('button', { name: 'Verify password' }))
      } else {
        await user.click(await screen.findByRole('button', { name: 'Verify with Google' }))
      }

      await vi.waitFor(() => expect(controller.getState()).toEqual(terminalState))
      expect(clearProtectedState).toHaveBeenCalledOnce()
      expect(screen.queryByText('sensitive authorization detail')).toBeNull()
    },
  )

  it('navigates to a validated Google URL without caching the OAuth artifact', async () => {
    const authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque-state'
    const fetch = vi.fn(async () => Response.json({ authorizationUrl })) as unknown as typeof globalThis.fetch
    const navigateToOauth = vi.fn()
    const user = userEvent.setup()
    const { queryClient } = createHarness({ fetch, navigateToOauth })

    await user.click(screen.getByRole('button', { name: 'Request verification' }))
    await user.click(await screen.findByRole('button', { name: 'Verify with Google' }))

    expect(navigateToOauth).toHaveBeenCalledWith(authorizationUrl)
    expect(await screen.findByText('cancelled')).toBeTruthy()
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain('opaque-state')
  })

  it('rejects an unsafe OAuth URL and keeps the explicit flow open', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ authorizationUrl: 'http://accounts.google.com/auth?state=unsafe' }),
    ) as unknown as typeof globalThis.fetch
    const navigateToOauth = vi.fn()
    const user = userEvent.setup()
    createHarness({ fetch, navigateToOauth })

    await user.click(screen.getByRole('button', { name: 'Request verification' }))
    await user.click(await screen.findByRole('button', { name: 'Verify with Google' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Unexpected error')
    expect(navigateToOauth).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Verify identity' })).toBeTruthy()
    expect(normalizeAdminPrimaryAuthOauthUrl('https://accounts.google.com.attacker.example/authorize')).toBeNull()
    expect(normalizeAdminPrimaryAuthOauthUrl('https://attacker@accounts.google.com/authorize')).toBeNull()
  })

  it('aborts and resolves a pending request when administrator authorization is lost', async () => {
    const fetch = vi.fn(async () => new Promise<Response>(() => undefined)) as unknown as typeof globalThis.fetch
    const user = userEvent.setup()
    const { Harness, rendered } = createHarness({ fetch })

    await user.click(screen.getByRole('button', { name: 'Request verification' }))
    expect(await screen.findByRole('dialog', { name: 'Verify identity' })).toBeTruthy()

    rendered.rerender(<Harness authSnapshot={{ status: 'forbidden' }} />)

    expect(await screen.findByText('cancelled')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Verify identity' })).toBeNull())
  })

  it('does not open a duplicate modal or promise for concurrent callers', async () => {
    const fetch = vi.fn(async () => new Promise<Response>(() => undefined)) as unknown as typeof globalThis.fetch
    let first: Promise<boolean> | undefined
    let second: Promise<boolean> | undefined
    const ConcurrentProbe = () => {
      const recentAuth = useAdminRecentAuth()
      return (
        <button
          onClick={() => {
            first = recentAuth.requestRecentAuth()
            second = recentAuth.requestRecentAuth()
          }}
          type="button"
        >
          Open twice
        </button>
      )
    }
    const user = userEvent.setup()
    createHarness({ children: <ConcurrentProbe />, fetch })

    await user.click(screen.getByRole('button', { name: 'Open twice' }))

    expect(first).toBe(second)
    expect(screen.getAllByRole('dialog', { name: 'Verify identity' })).toHaveLength(1)
  })
})