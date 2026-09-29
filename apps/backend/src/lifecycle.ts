import { serve as nodeServe, type ServerType } from '@hono/node-server'
import { Data, Effect } from 'effect'

export class ServerError extends Data.TaggedError('ServerError')<{
  readonly cause: unknown
}> {}

export const serve = (options: Parameters<typeof nodeServe>[0]) =>
  Effect.acquireRelease(
    Effect.callback<ServerType, ServerError>((resume) => {
      try {
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
            // Stop accepting work, drain active requests, then bound long-lived streams.
            const deadline = setTimeout(() => {
              if ('closeAllConnections' in server) server.closeAllConnections()
            }, 10_000)
            deadline.unref()
            server.close(() => {
              clearTimeout(deadline)
              resolve()
            })
            if ('closeIdleConnections' in server) server.closeIdleConnections()
          }),
      ),
  )