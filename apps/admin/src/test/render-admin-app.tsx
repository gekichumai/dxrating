import { render } from '@testing-library/react'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { AdminProviders } from '../providers'
import { createAdminRouter } from '../router'

export const renderAdminApp = async (path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] })
  const router = createAdminRouter({ history })
  await router.load()
  const rendered = render(
    <AdminProviders>
      <RouterProvider router={router} />
    </AdminProviders>,
  )
  return { ...rendered, router }
}