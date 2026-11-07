import { createRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { scheduleErrorReporting } from './setup/error-reporting-loader'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // On the client, the router reads the nonce back from the `csp-nonce` meta tag it renders.
    ssr: { nonce: readServerCspNonce() },
  })

  // Sentry loads after hydration, so a blocked SDK can't stop the page from hydrating (setup/error-reporting-loader.ts)
  if (!router.isServer) scheduleErrorReporting(router)

  return router
}

/** The nonce of the Content-Security-Policy of the response being rendered (start.ts), on the server only */
function readServerCspNonce(): string | undefined {
  try {
    const context = getGlobalStartContext() as { cspNonce?: unknown } | undefined
    return typeof context?.cspNonce === 'string' ? context.cspNonce : undefined
  } catch {
    // Outside a request (no start context), there is no page to render.
    return undefined
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}