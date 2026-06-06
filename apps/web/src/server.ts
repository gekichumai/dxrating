import * as Sentry from '@sentry/tanstackstart-react'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import { StartServer, createStartHandler } from '@tanstack/react-start/server'
import { renderRouterToStream } from '@tanstack/react-router/ssr/server'
import { createElement } from 'react'
import { createServerEntry, type ServerEntry } from '@tanstack/react-start/server-entry'
import { applyHomepageAgentDiscoveryHeaders } from './setup/agent-discovery'
import { BUNDLE } from './utils/bundle'
import { appendVaryHeader, detectServerLocale } from './setup/locale'
import { finishServerTimingSpan, setServerTimingHeader, startServerTimingSpan } from './setup/server-timing'

Sentry.init({
  dsn: 'https://9346c04036724f129e00a750c8ab9415@o4506648698683392.ingest.us.sentry.io/4511398317064192',
  release: `dxrating@${BUNDLE.version ?? 'unknown'}`,
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0.2,
})

const startHandler = createStartHandler(async ({ request, router, responseHeaders }) => {
  const ssrTiming = startServerTimingSpan('ssr')
  const setupTiming = startServerTimingSpan('ssr_setup')
  const locale = detectServerLocale(request)

  responseHeaders.set('Content-Language', locale)
  appendVaryHeader(responseHeaders, 'Cookie')
  appendVaryHeader(responseHeaders, 'Accept-Language')
  applyHomepageAgentDiscoveryHeaders(responseHeaders, request)

  const setupMetric = finishServerTimingSpan(setupTiming)
  const response = await renderRouterToStream({
    request,
    router,
    responseHeaders,
    children: createElement(StartServer, { router }),
  })

  applyHomepageAgentDiscoveryHeaders(response.headers, request)
  setServerTimingHeader(response.headers, [setupMetric, finishServerTimingSpan(ssrTiming)])

  return response
})

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    return startHandler(request, opts as Parameters<typeof startHandler>[1])
  },
})

export default createServerEntry(requestHandler)