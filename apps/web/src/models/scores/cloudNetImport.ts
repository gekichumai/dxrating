import {
  CLOUD_SAVE_EXPECTED_USER_HEADER,
  CLOUD_SAVE_NET_IMPORT_ROUTE,
  type ImportResultDTO,
  type NetImportInput,
  NET_IMPORT_SSE_EVENTS,
} from '@gekichumai/api-contract'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { CloudImportHttpError } from './cloudImports'

/**
 * The maimai NET import into a cloud save (`CLOUD_SAVE_NET_IMPORT_ROUTE`, design §8.3): a POST that answers with
 * Server-Sent Events, read the way `/functions/fetch-net-records` always has been (`fetchEventSource`), with the
 * session cookie. It carries the SEGA ID and password for this request only; they are never stored by this module.
 */

export type NetImportStreamEvent =
  | { type: 'progress'; state: string }
  | { type: 'done'; result: ImportResultDTO }
  | { type: 'error'; code: string; message: string; jobId: string | null }

export interface NetImportRequest {
  saveId: string
  body: NetImportInput
  /** The account the import is for (`X-DXRating-Expected-User`): the server refuses it for another one (§10) */
  expectedUserId?: string
}

/** Opens the stream; throws {@link CloudImportHttpError} when the route answers without one (409, 404, 429…) */
export type NetImportTransport = (
  request: NetImportRequest,
  signal?: AbortSignal,
) => AsyncIterable<NetImportStreamEvent>

/** Never retried by `fetchEventSource` itself: the repository decides, with the same idempotency key */
class StopStream extends Error {}

async function readErrorResponse(response: Response): Promise<CloudImportHttpError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Not JSON: the status says enough
  }
  const record = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  return new CloudImportHttpError(
    response.status,
    typeof record.code === 'string' ? record.code : undefined,
    record.data ?? null,
    typeof record.message === 'string' ? record.message : undefined,
  )
}

export function netImportUrl(saveId: string, origin: string = import.meta.env.VITE_BACKEND_URL ?? ''): string {
  return `${origin}${CLOUD_SAVE_NET_IMPORT_ROUTE.path.replace('{id}', encodeURIComponent(saveId))}`
}

export const streamNetImport: NetImportTransport = (request, signal) => ({
  [Symbol.asyncIterator]() {
    const queue: NetImportStreamEvent[] = []
    let failure: unknown = null
    let finished = false
    let wake: (() => void) | null = null
    const notify = () => {
      wake?.()
      wake = null
    }
    const controller = new AbortController()
    signal?.addEventListener('abort', () => controller.abort(), { once: true })

    const push = (event: NetImportStreamEvent) => {
      queue.push(event)
      if (event.type !== 'progress') finished = true
      notify()
    }

    void fetchEventSource(netImportUrl(request.saveId), {
      method: CLOUD_SAVE_NET_IMPORT_ROUTE.method,
      body: JSON.stringify(request.body),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(request.expectedUserId ? { [CLOUD_SAVE_EXPECTED_USER_HEADER]: request.expectedUserId } : {}),
      },
      credentials: 'include',
      openWhenHidden: true,
      signal: controller.signal,
      async onopen(response) {
        if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) return
        failure = response.ok
          ? new CloudImportHttpError(response.status, undefined, null)
          : await readErrorResponse(response)
        throw new StopStream()
      },
      onmessage(message) {
        try {
          const data: unknown = JSON.parse(message.data)
          if (message.event === 'progress') {
            push({ type: 'progress', state: NET_IMPORT_SSE_EVENTS.progress.parse(data).state })
          } else if (message.event === 'done') {
            push({ type: 'done', result: NET_IMPORT_SSE_EVENTS.done.parse(data) })
            controller.abort()
          } else if (message.event === 'error') {
            const parsed = NET_IMPORT_SSE_EVENTS.error.parse(data)
            push({ type: 'error', code: parsed.code, message: parsed.message, jobId: parsed.jobId })
            controller.abort()
          }
        } catch (error) {
          failure = error
          notify()
          controller.abort()
        }
      },
      onclose() {
        // The stream ended without `done` or `error`: a dropped connection, retried with the same key
        if (!finished && !failure) failure = new TypeError('The import stream closed early')
        throw new StopStream()
      },
      onerror(error) {
        if (!(error instanceof StopStream) && !failure)
          failure = error instanceof Error ? error : new TypeError(String(error))
        // Rethrowing stops fetchEventSource's own retries
        throw error
      },
    }).then(
      () => {
        finished = true
        notify()
      },
      () => {
        finished = true
        notify()
      },
    )

    return {
      async next(): Promise<IteratorResult<NetImportStreamEvent>> {
        for (;;) {
          const event = queue.shift()
          if (event) return { value: event, done: false }
          if (failure) {
            const error = failure
            failure = null
            finished = true
            throw error
          }
          if (finished) return { value: undefined, done: true }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
      },
      async return(): Promise<IteratorResult<NetImportStreamEvent>> {
        finished = true
        controller.abort()
        return { value: undefined, done: true }
      },
    }
  },
})