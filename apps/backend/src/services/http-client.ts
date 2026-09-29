import { Context, Effect, Layer, type Scope } from 'effect'
import { FetchHttpClient, HttpClient as NativeHttpClient, type HttpClientError } from 'effect/http'

export { HttpClientError as HttpError } from 'effect/http/HttpClientError'

export class HttpClient extends Context.Service<
  HttpClient,
  NativeHttpClient.HttpClient.With<HttpClientError.HttpClientError, Scope.Scope>
>()('dxrating/HttpClient') {}

// Keep the transport alive until the request scope closes, including the time
// between receiving response headers and consuming its body.
export const HttpClientLive = Layer.effect(
  HttpClient,
  Effect.map(NativeHttpClient.HttpClient, NativeHttpClient.withScope),
).pipe(Layer.provide(FetchHttpClient.layer))