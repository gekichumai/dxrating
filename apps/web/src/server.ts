import * as Sentry from '@sentry/tanstackstart-react'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry, type ServerEntry } from '@tanstack/react-start/server-entry'
import { BUNDLE } from './utils/bundle'

Sentry.init({
  dsn: 'https://1e929f3c3b929a213436e3c4dff57140@o4506648698683392.ingest.sentry.io/4506648709627904',
  release: `dxrating@${BUNDLE.version ?? 'unknown'}`,
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0.2,
})

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    return handler.fetch(request, opts as Parameters<typeof handler.fetch>[1])
  },
})

export default createServerEntry(requestHandler)