import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react'
import { createMiddleware, createStart } from '@tanstack/react-start'
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

export function buildStartOptions() {
  return {
    requestMiddleware: [sentryGlobalRequestMiddleware, localeMiddleware, securityReportHeadersMiddleware],
    functionMiddleware: [sentryGlobalFunctionMiddleware],
  }
}

export const startInstance = createStart(buildStartOptions)