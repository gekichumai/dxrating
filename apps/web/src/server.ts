import * as Sentry from '@sentry/tanstackstart-react'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import { StartServer, createStartHandler } from '@tanstack/react-start/server'
import { renderRouterToStream } from '@tanstack/react-router/ssr/server'
import { createElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { createServerEntry, type ServerEntry } from '@tanstack/react-start/server-entry'
import { BUNDLE } from './utils/bundle'
import { createServerI18n } from './setup/init-i18n'
import { appendVaryHeader, detectServerLocale } from './setup/locale'

Sentry.init({
  dsn: 'https://9346c04036724f129e00a750c8ab9415@o4506648698683392.ingest.us.sentry.io/4511398317064192',
  release: `dxrating@${BUNDLE.version ?? 'unknown'}`,
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0.2,
})

const startHandler = createStartHandler(async ({ request, router, responseHeaders }) => {
  const locale = detectServerLocale(request)

  responseHeaders.set('Content-Language', locale)
  appendVaryHeader(responseHeaders, 'Cookie')
  appendVaryHeader(responseHeaders, 'Accept-Language')

  return renderRouterToStream({
    request,
    router,
    responseHeaders,
    children: createElement(
      I18nextProvider,
      { i18n: createServerI18n(locale) },
      createElement(StartServer, { router }),
    ),
  })
})

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    return startHandler(request, opts as Parameters<typeof startHandler>[1])
  },
})

export default createServerEntry(requestHandler)