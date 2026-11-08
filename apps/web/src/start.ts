import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
  wrapMiddlewaresWithSentry,
} from '@sentry/tanstackstart-react'
import { createMiddleware, createStart } from '@tanstack/react-start'
import { applyAgentDiscoveryHeaders } from './setup/agent-discovery'
import { appendVaryHeader, detectServerLocale } from './setup/locale'
import { applySecurityHeaders, createCspNonce } from './setup/security-headers'

const localeMiddleware = createMiddleware().server(async ({ request, next }) => {
  const locale = detectServerLocale(request)
  const result = await next({ context: { locale, renderedAt: Date.now() } })

  result.response.headers.set('Content-Language', locale)
  appendVaryHeader(result.response.headers, 'Cookie')
  appendVaryHeader(result.response.headers, 'Accept-Language')

  return result
})

// The nonce reaches the router through the global start context (router.tsx), which renders it on every inline
// script of the page; the same nonce goes into the Content-Security-Policy of the response.
export const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const cspNonce = createCspNonce()
  const result = await next({ context: { cspNonce } })

  applySecurityHeaders(result.response.headers, { nonce: cspNonce })

  return result
})

const agentDiscoveryHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()

  applyAgentDiscoveryHeaders(result.response.headers)

  return result
})

export function buildStartOptions() {
  // Sentry is server-only here. In the browser its middleware are empty stubs, and importing them would put the SDK on
  // the hydration path, where an ad blocker that blocks it stops the page from hydrating.
  if (!import.meta.env.SSR) {
    return {
      requestMiddleware: [localeMiddleware, securityHeadersMiddleware, agentDiscoveryHeadersMiddleware],
      functionMiddleware: [],
    }
  }

  // Wrapped by hand, as Sentry's Vite plugin would (it skips files that already call wrapMiddlewaresWithSentry, and it
  // can't wrap a conditional list): each local middleware gets its own span. The global Sentry middleware come back
  // unwrapped and first.
  return {
    requestMiddleware: wrapMiddlewaresWithSentry({
      sentryGlobalRequestMiddleware,
      localeMiddleware,
      securityHeadersMiddleware,
      agentDiscoveryHeadersMiddleware,
    }),
    functionMiddleware: wrapMiddlewaresWithSentry({ sentryGlobalFunctionMiddleware }),
  }
}

export const startInstance = createStart(buildStartOptions)