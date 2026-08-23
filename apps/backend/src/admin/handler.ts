import { AdminProcedureAuthorizationPolicySchema, adminErrors } from '@gekichumai/admin-contract'
import { OpenAPIHandler, type OpenAPIHandlerOptions } from '@orpc/openapi/fetch'
import { StandardOpenAPIMatcher } from '@orpc/openapi/standard'
import { onError, type AnyRouter, type HTTPPath } from '@orpc/server'
import { RequestHeadersPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'
import { shouldCaptureSentryError } from '../lib/functions/sentry.js'
import { AdminAuthorizationFailure, requireAdminProcedurePolicy } from './authorization.js'
import { reportAdminException, sanitizeAdminCorrelationId } from './observability.js'
import { adminRouter } from './router.js'
import type { AdminRequestContext } from './router.js'

type AdminStandardErrorCode = Exclude<keyof typeof adminErrors, 'ADMIN_CLIENT_INCOMPATIBLE'>

export const createAdminStandardErrorBody = (code: AdminStandardErrorCode, requestId?: string) => {
  const definition = adminErrors[code]
  return {
    defined: true as const,
    code,
    status: definition.status,
    message: definition.message,
    data: { requestId: sanitizeAdminCorrelationId(requestId) ?? null },
  }
}

export const createAdminStandardErrorResponse = (code: AdminStandardErrorCode, requestId?: string) => {
  const body = createAdminStandardErrorBody(code, requestId)
  return Response.json(body, { status: body.status })
}

type AdminRootInterceptor = NonNullable<OpenAPIHandlerOptions<AdminRequestContext>['rootInterceptors']>[number]

export const createNormalizeAdminDecodeErrors = (router: AnyRouter): AdminRootInterceptor => {
  const policyMatcher = new StandardOpenAPIMatcher()
  policyMatcher.init(router)

  return async ({ context, request, prefix, next }) => {
    const result = await next()
    if (!result.matched || result.response.status !== 400) return result

    const body = result.response.body
    if (
      body === null ||
      typeof body !== 'object' ||
      !('defined' in body) ||
      body.defined !== false ||
      !('code' in body) ||
      body.code !== 'BAD_REQUEST'
    ) {
      return result
    }

    const pathname = prefix ? request.url.pathname.slice(prefix.length) || '/' : request.url.pathname
    const match = await policyMatcher.match(request.method, `/${pathname.replace(/^\/+|\/+$/g, '')}` as HTTPPath)
    const policy = AdminProcedureAuthorizationPolicySchema.safeParse(match?.procedure['~orpc'].meta.authorization)
    const procedureName = match?.path.join('.') ?? 'handler'
    let code: AdminStandardErrorCode = 'VALIDATION_FAILED'

    if (!policy.success) {
      code = 'INTERNAL_SERVER_ERROR'
    } else {
      try {
        requireAdminProcedurePolicy(context, policy.data)
      } catch (error) {
        if (error instanceof AdminAuthorizationFailure) {
          code = error.code === 'NOT_FOUND' ? 'INTERNAL_SERVER_ERROR' : error.code
        } else {
          code = 'INTERNAL_SERVER_ERROR'
        }
      }
    }

    try {
      await context.recordAuthorizationResult?.(procedureName, code)
    } catch {
      // A telemetry sink must not change the administrator response.
    }

    if (code === 'INTERNAL_SERVER_ERROR') {
      reportAdminException(procedureName, context.requestId)
    }

    return {
      matched: true as const,
      response: {
        ...result.response,
        status: adminErrors[code].status,
        body: createAdminStandardErrorBody(code, sanitizeAdminCorrelationId(context.requestId)),
      },
    }
  }
}

export const normalizeAdminDecodeErrors = createNormalizeAdminDecodeErrors(adminRouter)

export const adminOpenAPIHandler = new OpenAPIHandler(adminRouter, {
  plugins: [new RequestHeadersPlugin(), new ResponseHeadersPlugin()],
  rootInterceptors: [normalizeAdminDecodeErrors],
  clientInterceptors: [
    onError((error, { context, path }) => {
      if (!shouldCaptureSentryError(error)) return

      const procedureName = path.join('.')
      reportAdminException(procedureName, context.requestId)
    }),
  ],
})