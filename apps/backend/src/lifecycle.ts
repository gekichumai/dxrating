import { serve as nodeServe, type ServerType } from '@hono/node-server'
import { Data, Effect } from 'effect'
import type { MiddlewareHandler } from 'hono'

export class ServerError extends Data.TaggedError('ServerError')<{
  readonly cause: unknown
}> {}

/**
 * How long in-flight requests may run after SIGTERM before their connections are closed. Docker sends SIGKILL after
 * the container's stop grace period (`stop_grace_period: 30s` in docker-compose.prod.yml), and closing the database
 * pools and flushing Sentry come after the drain, so this stays well below it.
 */
export const DRAIN_TIMEOUT_MS = 20_000

let draining = false

/** True from the moment shutdown starts: readiness fails and new requests are refused while in-flight ones finish. */
export const isDraining = () => draining

/**
 * Refuses requests that arrive while the server drains (on a kept-alive connection the proxy reuses): 503 with
 * `Connection: close`, so the proxy retries them on the replacement container. `/health` answers 503 too, which is
 * the readiness signal.
 */
export const refuseWhileDraining: MiddlewareHandler = async (c, next) => {
  if (!draining) return next()
  c.header('Connection', 'close')
  c.header('Retry-After', '1')
  return c.json({ status: 'shutting_down' }, 503)
}

export const serve = (options: Parameters<typeof nodeServe>[0]) =>
  Effect.acquireRelease(
    Effect.callback<ServerType, ServerError>((resume) => {
      try {
        draining = false
        const server = nodeServe(options, () => resume(Effect.succeed(server)))
        server.once('error', (cause) => resume(Effect.fail(new ServerError({ cause }))))
      } catch (cause) {
        resume(Effect.fail(new ServerError({ cause })))
      }
    }),
    (server) =>
      Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            draining = true
            // Stop accepting connections, let in-flight requests finish, then bound long-lived streams.
            const deadline = setTimeout(() => {
              if ('closeAllConnections' in server) server.closeAllConnections()
            }, DRAIN_TIMEOUT_MS)
            deadline.unref()
            server.close(() => {
              clearTimeout(deadline)
              resolve()
            })
            if ('closeIdleConnections' in server) server.closeIdleConnections()
          }),
      ),
  )