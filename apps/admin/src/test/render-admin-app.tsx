import { render } from '@testing-library/react'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import type { AdminAuthClient } from '../auth/admin-auth-client'
import type { AdminAuthSnapshot } from '../auth/admin-auth-context'
import { createAdminRuntime, type AdminRuntime, type CreateAdminRuntimeOptions } from '../data/admin-runtime'
import { createAdminTestQueryClient } from '../data/query-client'
import { AdminProviders } from '../providers'
import { createAdminRouter } from '../router'

export type RenderAdminAppOptions = {
  readonly authClient?: AdminAuthClient
  readonly auth?: AdminAuthSnapshot
  readonly runtime?: AdminRuntime
}

export const createAdminTestAuthClient = (): AdminAuthClient => ({
  beginSocialSignIn: async () => ({
    ok: false,
    failure: { kind: 'unexpected', operation: 'social' },
  }),
  getSession: async () => ({ ok: true, data: null }),
  signInWithPassword: async () => ({
    ok: false,
    failure: { kind: 'invalid-credentials', operation: 'password' },
  }),
  signOut: async () => ({ ok: true, data: null }),
  useSession: () => ({
    data: null,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: async () => undefined,
  }),
})

export const AUTHENTICATED_ADMIN_AUTH: AdminAuthSnapshot = {
  status: 'authenticated',
  principal: {
    userId: 'test-administrator',
    effectiveRole: 'super_admin',
    capabilities: {
      canModerateUsers: true,
      canModerateAdministrators: true,
      canManageAdministrators: true,
    },
  },
}

const createTestCompatibilityStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

const pendingTestFetch = () => new Promise<Response>(() => undefined)

export const createAdminTestRuntime = (
  dataClient: NonNullable<CreateAdminRuntimeOptions['dataClient']> = {},
): AdminRuntime =>
  createAdminRuntime({
    dataClient: {
      backendOrigin: 'https://api.dxrating.test',
      fetch: pendingTestFetch,
      mode: 'test',
      ...dataClient,
    },
    queryClientFactory: createAdminTestQueryClient,
    reload: () => undefined,
    storage: createTestCompatibilityStorage(),
  })

export const renderAdminApp = async (path: string, options: RenderAdminAppOptions = {}) => {
  const history = createMemoryHistory({ initialEntries: [path] })
  const router = createAdminRouter({ history })
  const runtime = options.runtime ?? createAdminTestRuntime()
  const auth = options.auth ?? AUTHENTICATED_ADMIN_AUTH
  const authClient = options.authClient ?? createAdminTestAuthClient()
  await router.load()
  const rendered = render(
    <AdminProviders auth={auth} authClient={authClient} runtime={runtime}>
      <RouterProvider router={router} />
    </AdminProviders>,
  )
  return {
    ...rendered,
    auth,
    authClient,
    compatibility: runtime.compatibility,
    data: runtime.data,
    queryClient: runtime.queryClient,
    router,
  }
}