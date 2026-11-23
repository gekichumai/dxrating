import { createRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { scheduleErrorReporting } from './setup/error-reporting-loader'
import { getClientLocale } from './i18n/runtime'
import { DEFAULT_LOCALE, type SupportedLocale, localizePath, splitLocalePath, toSupportedLocale } from './setup/locale'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // On the client, the router reads the nonce back from the `csp-nonce` meta tag it renders.
    ssr: { nonce: readServerCspNonce() },
    // The language lives in the path (`/ja/songs/…`; none for English, meta#52). Routes match the path without it, and
    // every href the router builds (Link, navigate, redirect) gets the prefix of the language the page is in, so no
    // call site handles the locale
    rewrite: {
      input: ({ url }) => {
        const { locale, pathname } = splitLocalePath(url.pathname)
        if (locale === DEFAULT_LOCALE) return undefined
        url.pathname = pathname
        return url
      },
      output: ({ url }) => {
        const locale = typeof document === 'undefined' ? readServerLocale() : getClientLocale()
        if (locale === DEFAULT_LOCALE || !isLocalizablePath(url.pathname)) return undefined
        url.pathname = localizePath(url.pathname, locale)
        return url
      },
    },
  })

  // Sentry loads after hydration, so a blocked SDK can't stop the page from hydrating (setup/error-reporting-loader.ts)
  if (!router.isServer) scheduleErrorReporting(router)

  return router
}

/** The nonce of the Content-Security-Policy of the response being rendered (start.ts), on the server only */
/** The locale of the page this server render is for, from the request middleware (start.ts) */
function readServerLocale(): SupportedLocale {
  try {
    const context = getGlobalStartContext() as { locale?: unknown } | undefined
    return toSupportedLocale(typeof context?.locale === 'string' ? context.locale : undefined) ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

// Files the server answers on its own have no language variants
const isLocalizablePath = (pathname: string) =>
  !/^\/(?:_|\.well-known\/|api\/)|\.(?:txt|xml|json|webmanifest|ico|png|jpe?g|webp|avif|gif|svg|pdf)$/i.test(pathname)

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