import { render } from '@testing-library/react'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { PENDING_ADMIN_AUTH, type AdminAuthSnapshot } from '../auth/admin-auth-context'
import { createAdminRuntime, type AdminRuntime, type CreateAdminRuntimeOptions } from '../data/admin-runtime'
import { createAdminTestQueryClient } from '../data/query-client'
import { AdminProviders } from '../providers'
import { createAdminRouter } from '../router'

export type RenderAdminAppOptions = {
  readonly auth?: AdminAuthSnapshot
  readonly runtime?: AdminRuntime
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
  const auth = options.auth ?? PENDING_ADMIN_AUTH
  await router.load()
  const rendered = render(
    <AdminProviders auth={auth} runtime={runtime}>
      <RouterProvider router={router} />
    </AdminProviders>,
  )
  return {
    ...rendered,
    auth,
    compatibility: runtime.compatibility,
    data: runtime.data,
    queryClient: runtime.queryClient,
    router,
  }
}