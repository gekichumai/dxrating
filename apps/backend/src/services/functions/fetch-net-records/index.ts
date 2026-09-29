import { Cause, Clock, Effect, Data, Runtime } from 'effect'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  withMaimaiNETClient,
  NetImportError,
  type AuthParams,
  type StateUpdateCallback,
} from '../../../lib/functions/client.js'
import { Sentry, type Scope } from '../../../lib/functions/sentry.js'
import { runApp } from '../../../runtime.js'

export class NetStreamError extends Data.TaggedError('NetStreamError')<{
  readonly operation: string
  readonly cause: unknown
}> {
  get message() {
    return this.cause instanceof Error ? this.cause.message : this.operation + ' failed'
  }
}

const reportError = (failure: unknown, region: string, streaming: boolean) => {
  const error = failure
  if (!(error instanceof Error)) return
  Sentry.withScope((scope: Scope) => {
    scope.setContext('function', { name: streaming ? 'fetchNetRecords_v1' : 'fetchNetRecords_v0' })
    scope.setContext('parameters', { region })
    scope.setContext('endpoint', { name: streaming ? 'MaimaiNET (SSE)' : 'MaimaiNET' })
    if (error.message.includes('response redirects to error page')) scope.setFingerprint(['net-error-redirect'])
    Sentry.captureException(error)
  })
}

export const fetchNetRecordsEffect = (
  region: 'jp' | 'intl',
  authParams: AuthParams,
  onProgress?: StateUpdateCallback,
) =>
  withMaimaiNETClient(
    region,
    (client) =>
      Effect.gen(function* () {
        yield* Effect.sync(() =>
          Sentry.addBreadcrumb({
            message: 'Attempting login to MaimaiNET',
            category: 'auth',
            data: { region },
            level: 'info',
          }),
        )
        yield* client.loginEffect(authParams)
        yield* Effect.sync(() =>
          Sentry.addBreadcrumb({ message: 'Fetching recent records', category: 'fetch', level: 'info' }),
        )
        const recent = yield* client.fetchRecentRecordsEffect()
        yield* Effect.sync(() =>
          Sentry.addBreadcrumb({ message: 'Fetching music records', category: 'fetch', level: 'info' }),
        )
        const music = yield* client.fetchMusicRecordsEffect()
        yield* Effect.sync(() =>
          Sentry.addBreadcrumb({
            message: 'Successfully fetched all records',
            category: 'success',
            data: { recentCount: recent.length, musicCount: music.length },
            level: 'info',
          }),
        )
        return { recent, music }
      }),
    onProgress,
  )

export const v0Handler = (c: Context) => {
  const region = c.get('region') as 'jp' | 'intl'
  const program = fetchNetRecordsEffect(region, c.get('authParams')).pipe(
    Effect.map(({ recent, music }) => c.json({ recentRecords: recent, musicRecords: music })),
    Effect.tapError((error) => Effect.sync(() => reportError(error, region, false))),
  )
  return Sentry.startSpan({ name: 'fetchNetRecords_v0', op: 'function' }, () =>
    runApp(program, { signal: c.req.raw.signal }),
  )
}

export const v1Handler = (c: Context) => {
  const region = c.get('region') as 'jp' | 'intl'
  return streamSSE(c, async (stream) => {
    const disconnected = new AbortController()
    stream.onAbort(() => disconnected.abort())
    const signal = AbortSignal.any([c.req.raw.signal, disconnected.signal])
    const onProgress: StateUpdateCallback = (state) => {
      Sentry.addBreadcrumb({
        message: `Progress update: ${state}`,
        category: 'progress',
        data: { state, region },
        level: 'info',
      })
      return stream.writeSSE({ event: 'progress', data: JSON.stringify({ state }) })
    }
    const program = Effect.gen(function* () {
      const startedAt = yield* Clock.currentTimeMillis
      const { recent, music } = yield* fetchNetRecordsEffect(region, c.get('authParams'), onProgress)
      const finishedAt = yield* Clock.currentTimeMillis
      yield* Effect.sync(() => {
        Sentry.metrics.distribution('net_fetch.duration', finishedAt - startedAt, {
          unit: 'millisecond',
          attributes: { region },
        })
        Sentry.metrics.distribution('net_fetch.music_records', music.length, { unit: 'none', attributes: { region } })
        Sentry.metrics.distribution('net_fetch.recent_records', recent.length, { unit: 'none', attributes: { region } })
      })
      yield* Effect.tryPromise({
        try: () => stream.writeSSE({ event: 'progress', data: JSON.stringify({ state: 'concluded' }) }),
        catch: (cause) => new NetStreamError({ operation: 'write NET import completion', cause }),
      })
      yield* Effect.tryPromise({
        try: () => stream.writeSSE({ event: 'data', data: JSON.stringify({ recent, music }) }),
        catch: (cause) => new NetStreamError({ operation: 'write NET import records', cause }),
      })
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            Sentry.metrics.count('net_fetch.failure', 1, {
              attributes: { region, error_code: error instanceof NetImportError ? error.code : 'unknown' },
            })
            reportError(error, region, true)
          })
          yield* Effect.tryPromise({
            try: () =>
              stream.writeSSE({
                event: 'error',
                data: JSON.stringify({
                  code: error instanceof NetImportError ? error.code : 'UNKNOWN_ERROR',
                  error: error instanceof Error ? error.message : 'internal server error',
                }),
              }),
            catch: (cause) => new NetStreamError({ operation: 'write NET import error', cause }),
          })
        }),
      ),
    )
    try {
      await Sentry.startSpan({ name: 'fetchNetRecords_v1', op: 'function' }, () => runApp(program, { signal }))
    } catch (error) {
      if (
        !signal.aborted &&
        !(Runtime.isFiberFailure(error) && Cause.isInterruptedOnly(error[Runtime.FiberFailureCauseId]))
      ) {
        throw error
      }
    }
  })
}