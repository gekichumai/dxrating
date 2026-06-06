import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react'
import { createMiddleware, createStart } from '@tanstack/react-start'
import { applyHomepageAgentDiscoveryHeaders } from './setup/agent-discovery'
import { appendVaryHeader, detectServerLocale } from './setup/locale'
import { applySecurityReportHeaders } from './setup/security-headers'

const localeMiddleware = createMiddleware().server(async ({ request, next }) => {
  const locale = detectServerLocale(request)
  const result = await next({ context: { locale, renderedAt: Date.now() } })

  result.response.headers.set('Content-Language', locale)
  appendVaryHeader(result.response.headers, 'Cookie')
  appendVaryHeader(result.response.headers, 'Accept-Language')

  return result
})

const securityReportHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()

  applySecurityReportHeaders(result.response.headers)

  return result
})

const agentDiscoveryHeadersMiddleware = createMiddleware().server(async ({ request, next }) => {
  const result = await next()

  applyHomepageAgentDiscoveryHeaders(result.response.headers, request)

  return result
})

export function buildStartOptions() {
  return {
    requestMiddleware: [
      sentryGlobalRequestMiddleware,
      localeMiddleware,
      securityReportHeadersMiddleware,
      agentDiscoveryHeadersMiddleware,
    ],
    functionMiddleware: [sentryGlobalFunctionMiddleware],
  }
}

export const startInstance = createStart(buildStartOptions)