import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { onError } from '@orpc/server'
import { RequestHeadersPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'
import { shouldCaptureSentryError } from '../lib/functions/sentry.js'
import { reportAdminException } from './observability.js'
import { adminRouter } from './router.js'

export const adminOpenAPIHandler = new OpenAPIHandler(adminRouter, {
  plugins: [new RequestHeadersPlugin(), new ResponseHeadersPlugin()],
  clientInterceptors: [
    onError((error, { context, path }) => {
      if (!shouldCaptureSentryError(error)) return

      const procedureName = path.join('.')
      reportAdminException(procedureName, context.requestId)
    }),
  ],
})