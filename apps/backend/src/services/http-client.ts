import { Context, Data, Effect, Layer, type Scope } from 'effect'

export class HttpError extends Data.TaggedError('HttpError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

export class HttpClient extends Context.Tag('dxrating/HttpClient')<
  HttpClient,
  {
    readonly request: (url: string | URL, init?: RequestInit) => Effect.Effect<Response, HttpError, Scope.Scope>
    readonly json: <A = unknown>(response: Response) => Effect.Effect<A, HttpError>
    readonly text: (response: Response) => Effect.Effect<string, HttpError>
  }
>() {}

export const makeHttpClient = (fetchImplementation: typeof fetch): typeof HttpClient.Service => ({
  request: (url, init) =>
    Effect.gen(function* () {
      // Retain cancellation until the response body has been consumed, including
      // failures between receiving headers and starting a JSON/body read.
      const controller = yield* Effect.acquireRelease(
        Effect.sync(() => new AbortController()),
        (resource) => Effect.sync(() => resource.abort()),
      )
      return yield* Effect.tryPromise({
        try: (signal) =>
          fetchImplementation(url, {
            ...init,
            signal: AbortSignal.any([controller.signal, signal, ...(init?.signal ? [init.signal] : [])]),
          }),
        catch: (cause) => new HttpError({ operation: 'HTTP request', cause }),
      })
    }),
  json: <A>(response: Response) =>
    Effect.tryPromise({
      try: () => response.json() as Promise<A>,
      catch: (cause) => new HttpError({ operation: 'Decode HTTP JSON', cause }),
    }),
  text: (response) =>
    Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => new HttpError({ operation: 'Read HTTP body', cause }),
    }),
})

export const HttpClientLive = Layer.succeed(
  HttpClient,
  makeHttpClient((...args) => fetch(...args)),
)