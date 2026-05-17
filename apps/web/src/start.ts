import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react'
import { createMiddleware, createStart } from '@tanstack/react-start'
import { applySecurityReportHeaders } from './setup/security-headers'

const securityReportHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()

  applySecurityReportHeaders(result.response.headers)

  return result
})

export function buildStartOptions() {
  return {
    requestMiddleware: [sentryGlobalRequestMiddleware, securityReportHeadersMiddleware],
    functionMiddleware: [sentryGlobalFunctionMiddleware],
  }
}

export const startInstance = createStart(buildStartOptions)