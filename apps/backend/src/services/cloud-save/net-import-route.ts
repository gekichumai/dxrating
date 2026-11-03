import {
  NetImportInputSchema,
  NetImportParamsSchema,
  type ImportResultDTO,
  type NetImportInput,
} from '@gekichumai/api-contract'
import { ORPCError } from '@orpc/server'
import * as Sentry from '@sentry/node'
import { Effect, Result } from 'effect'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Authentication } from '../../auth'
import { Database } from '../../db/index'
import { holdCredentials } from '../../lib/credential-hygiene'
import type { StateUpdateCallback } from '../../lib/functions/client'
import { orpcErrorResponse } from '../../lib/orpc-error-response'
import { runApp } from '../../runtime'
import { FeatureFlags } from '../feature-flags'
import { clientKey } from '../mcp/client-key'
import { cloudSaveRateLimits } from '../rate-limit'
import { CloudSaveNotFound, ImportInProgress } from './errors'
import {
  beginServerImport,
  replayOutcome,
  runServerImport,
  type ServerImportErrorCode,
  type ServerImportOutcome,
} from './server-imports'
import { fetchNetImport } from './upstream-imports'

/** NET fetches running at once across all users: protects SEGA and the database pool (design §7.1, §11.4) */
export const NET_IMPORT_GLOBAL_CONCURRENCY = 4
/** NET imports one user may run at once (§11.4) */
export const NET_IMPORT_USER_CONCURRENCY = 1
/** How long a NET fetch (login, friend code page, six difficulty pages with retries) may take */
const NET_IMPORT_TIMEOUT = '10 minutes'
const USER_BUSY_RETRY_AFTER_SECONDS = 5
const GLOBAL_BUSY_RETRY_AFTER_SECONDS = 15

let globalRunning = 0
const userRunning = new Map<string, number>()

/** Running NET imports (tests) */
export const runningNetImports = () => globalRunning

/** Fixed messages of the SSE `error` event: never upstream text, which could echo what the user typed */
const ERROR_MESSAGES: Partial<Record<ServerImportErrorCode, string>> = {
  invalid_credentials: 'maimai NET rejected the SEGA ID or password.',
  net_maintenance: 'maimai NET is under maintenance.',
  aime_card_unavailable: 'maimai NET did not provide a usable Aime card for this SEGA ID.',
  token_error: 'maimai NET did not answer with a login form.',
  upstream_error: 'maimai NET could not be read. Nothing was imported.',
  timeout: 'maimai NET took too long to answer. Nothing was imported.',
  catalog_unavailable: 'The song catalog is not available yet. Nothing was imported.',
  save_not_found: 'The save no longer exists.',
  save_busy: 'The save was busy. Nothing was imported.',
}

const tooManyRequests = (retryAfterSeconds: number) =>
  orpcErrorResponse(
    new ORPCError('TOO_MANY_REQUESTS', {
      message: `Too many requests. Retry in ${retryAfterSeconds} seconds.`,
      data: { retryAfterSeconds },
    }),
    { 'Retry-After': String(retryAfterSeconds) },
  )

/** Validation failures name the fields only: zod messages could quote what was sent */
const badRequest = (issues: readonly { path: readonly PropertyKey[]; code: string }[]) =>
  orpcErrorResponse(
    new ORPCError('BAD_REQUEST', {
      message: 'Input validation failed',
      data: { issues: issues.map((issue) => ({ path: issue.path.map(String), code: issue.code })) },
    }),
  )

/**
 * `POST /api/v1/saves/:id/imports/maimai-net` (design §5.1, §7.1): the server logs in to maimai NET, fetches the
 * records and writes them straight into the save as `verified`, streaming progress over SSE. The client never sees
 * nor sends back the records.
 *
 * Before the stream (JSON errors): session (401) -> `cloud_save` and `server_imports` (404 when off) -> body (400)
 * -> per-user (6/h, 30/day) and per-address (30/h) limits, one running NET import per user, at most
 * {@link NET_IMPORT_GLOBAL_CONCURRENCY} at once (429 with `Retry-After`) -> the save (404) -> the job: a running job of
 * the same source is 409 `IMPORT_IN_PROGRESS` with its ID. A replayed idempotency key streams `done` with the job as
 * it is (it may still be running: poll `GET /imports/{id}`).
 *
 * Then the stream: `progress` events (the states of the legacy route), and `done` `{job, revision}` or `error`
 * `{code, message, jobId}`. The job runs to its end even if the client disconnects (it polls the job instead); a
 * server shutdown fails it (`interrupted`).
 *
 * The SEGA ID and password live in this request only: held for log scrubbing while it runs, never stored, never
 * logged, never echoed (design §7.2).
 */
export const netImportHandler = (c: Context) =>
  runApp(
    Effect.gen(function* () {
      const auth = yield* Authentication
      const session = yield* auth.session(c.req.raw.headers)
      if (!session?.user) return orpcErrorResponse(new ORPCError('UNAUTHORIZED'))
      const userId = session.user.id
      const featureFlags = yield* FeatureFlags
      if (
        !(yield* featureFlags.isEnabled('cloud_save', userId)) ||
        !(yield* featureFlags.isEnabled('server_imports', userId))
      ) {
        return orpcErrorResponse(new ORPCError('NOT_FOUND'))
      }

      const params = NetImportParamsSchema.safeParse({ id: c.req.param('id') })
      if (!params.success) return badRequest(params.error.issues)
      const body = yield* Effect.tryPromise({
        try: () => c.req.json<unknown>(),
        catch: () => null,
      }).pipe(Effect.orElseSucceed(() => undefined))
      const parsed = NetImportInputSchema.safeParse(body)
      if (!parsed.success) return badRequest(parsed.error.issues)
      const input = parsed.data
      const release = holdCredentials([input.id, input.password])
      let handedOver = false
      let releaseSlots = () => {}
      try {
        // Limits: counted first, given back when the request ends up doing no work
        const takenAt = Date.now()
        const userWait = cloudSaveRateLimits.netImports.take(userId, 1, takenAt)
        if (userWait > 0) return tooManyRequests(userWait)
        const socketAddress = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming
          ?.socket?.remoteAddress
        const addressKey = clientKey(c.req.raw.headers, socketAddress)
        const addressWait = cloudSaveRateLimits.netImportsByAddress.take(addressKey, 1, takenAt)
        const refund = () => {
          cloudSaveRateLimits.netImports.refund(userId, 1, takenAt)
          if (addressWait === 0) cloudSaveRateLimits.netImportsByAddress.refund(addressKey, 1, takenAt)
        }
        if (addressWait > 0) {
          refund()
          return tooManyRequests(addressWait)
        }
        if ((userRunning.get(userId) ?? 0) >= NET_IMPORT_USER_CONCURRENCY) {
          refund()
          return tooManyRequests(USER_BUSY_RETRY_AFTER_SECONDS)
        }
        if (globalRunning >= NET_IMPORT_GLOBAL_CONCURRENCY) {
          refund()
          return tooManyRequests(GLOBAL_BUSY_RETRY_AFTER_SECONDS)
        }
        // The slots are taken at once (no await between the check and the take) and given back when the stream
        // ends, or below when the request ends up not streaming an import
        globalRunning += 1
        userRunning.set(userId, (userRunning.get(userId) ?? 0) + 1)
        let slotsReleased = false
        releaseSlots = () => {
          if (slotsReleased) return
          slotsReleased = true
          globalRunning -= 1
          const left = (userRunning.get(userId) ?? 1) - 1
          if (left > 0) userRunning.set(userId, left)
          else userRunning.delete(userId)
        }

        const database = yield* Database
        const begun = yield* beginServerImport(database, {
          userId,
          saveId: params.data.id,
          source: input.region === 'jp' ? 'maimai-net-jp' : 'maimai-net-intl',
          trigger: input.trigger,
          idempotencyKey: input.idempotencyKey,
        }).pipe(Effect.result)
        if (Result.isFailure(begun)) {
          refund()
          const error = begun.failure
          if (error instanceof CloudSaveNotFound) return orpcErrorResponse(new ORPCError('NOT_FOUND'))
          if (error instanceof ImportInProgress) {
            return orpcErrorResponse(
              new ORPCError('CONFLICT', {
                message: 'An import of this source is already running',
                data: { reason: 'IMPORT_IN_PROGRESS', jobId: error.jobId },
              }),
            )
          }
          return yield* Effect.fail(error)
        }
        const started = begun.success
        if (started.replayed) {
          refund()
          const outcome = replayOutcome(started)
          return streamSSE(c, async (stream) => {
            await stream.writeSSE({ event: 'done', data: JSON.stringify(resultOf(outcome)) })
          })
        }

        handedOver = true
        return streamSSE(c, async (stream) => {
          let open = true
          stream.onAbort(() => {
            open = false
          })
          const send = async (event: string, data: unknown) => {
            if (!open) return
            try {
              await stream.writeSSE({ event, data: JSON.stringify(data) })
            } catch {
              // the client left; the job carries on and the client polls it
              open = false
            }
          }
          const onProgress: StateUpdateCallback = (state) => {
            Sentry.addBreadcrumb({
              message: `Progress update: ${state}`,
              category: 'progress',
              data: { state, region: input.region },
              level: 'info',
            })
            return send('progress', { state })
          }
          try {
            const outcome = await runApp(
              runServerImport(database, started, fetchNetImport(input.region, credentialsOf(input), onProgress), {
                timeout: NET_IMPORT_TIMEOUT,
              }),
            )
            if (outcome.errorCode === null) {
              await send('progress', { state: 'concluded' })
              await send('done', resultOf(outcome))
            } else {
              await send('error', {
                code: outcome.errorCode.toUpperCase(),
                message: ERROR_MESSAGES[outcome.errorCode] ?? 'The import failed. Nothing was imported.',
                jobId: outcome.job.id,
              })
            }
          } catch {
            // interrupted by a shutdown: the job is already failed (`interrupted`)
            await send('error', {
              code: 'INTERRUPTED',
              message: 'The server is restarting. Nothing was imported.',
              jobId: started.job.id,
            })
          } finally {
            releaseSlots()
            release()
          }
        })
      } finally {
        if (!handedOver) {
          releaseSlots()
          release()
        }
      }
    }),
    { signal: c.req.raw.signal },
  )

const credentialsOf = (input: NetImportInput) => ({ id: input.id, password: input.password })

const resultOf = (outcome: ServerImportOutcome): ImportResultDTO => ({ job: outcome.job, revision: outcome.revision })