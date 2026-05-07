import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { initI18n } from './setup/init-i18n'

initI18n()

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}