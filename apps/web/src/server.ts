import { StartServer, createStartHandler } from '@tanstack/react-start/server'
import { renderRouterToStream } from '@tanstack/react-router/ssr/server'
import { createElement } from 'react'
import { createServerEntry, type ServerEntry } from '@tanstack/react-start/server-entry'
import { appendVaryHeader, detectServerLocale } from './setup/locale'
import { acceptsMarkdown, normalizeMarkdownAcceptForHtmlRender } from './setup/markdownNegotiation'
import { finishServerTimingSpan, setServerTimingHeader, startServerTimingSpan } from './setup/server-timing'

const startHandler = createStartHandler(async ({ request, router, responseHeaders }) => {
  const ssrTiming = startServerTimingSpan('ssr')
  const setupTiming = startServerTimingSpan('ssr_setup')
  const locale = detectServerLocale(request)

  responseHeaders.set('Content-Language', locale)
  appendVaryHeader(responseHeaders, 'Cookie')
  appendVaryHeader(responseHeaders, 'Accept-Language')

  const setupMetric = finishServerTimingSpan(setupTiming)
  const response = await renderRouterToStream({
    request,
    router,
    responseHeaders,
    children: createElement(StartServer, { router }),
  })

  setServerTimingHeader(response.headers, [setupMetric, finishServerTimingSpan(ssrTiming)])

  return response
})

async function handleRequest(request: Request, opts: Parameters<typeof startHandler>[1]) {
  const shouldVaryOnAccept = acceptsMarkdown(request)
  const response = await startHandler(normalizeMarkdownAcceptForHtmlRender(request), opts)

  if (shouldVaryOnAccept) appendVaryHeader(response.headers, 'Accept')

  return response
}

const requestHandler: ServerEntry = {
  fetch(request, opts) {
    return handleRequest(request, opts as Parameters<typeof startHandler>[1])
  },
}

export default createServerEntry(requestHandler)
