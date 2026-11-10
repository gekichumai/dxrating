// A client that leaves mid-request is not a server error (DXRATING-BACKEND-1Z); a real failure still reaches Sentry.
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { handlerGen } from '@orpc/experimental-effect'
import { openapi } from '@orpc/openapi'
import { onError, os } from '@orpc/server'
import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core'
import { Cause, Effect } from 'effect'
import { ConnectionError, SqlError } from 'effect/sql/SqlError'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseError } from '../db/index'
import { Sentry } from '../lib/functions/sentry'
import { databaseErrorTags, isClientAbort, reportProcedureError } from '../orpc-error-reporting'
import { ClientClosedRequestError } from '../request-runner'

const connectionTimeout = () =>
  new DatabaseError({
    operation: 'Announcements.listPublic',
    // The shape drizzle-orm/effect-postgres fails with: the SqlError inside an Effect Cause
    cause: new EffectDrizzleQueryError({
      query: 'select "id" from "announcements"',
      params: [],
      cause: Cause.fail(
        new SqlError({
          reason: new ConnectionError({ cause: new Error('Connection timed out'), operation: 'connect' }),
        }),
      ),
    }),
  })

/** An oRPC handler wired the way app.ts wires it, around procedures that wait for the test to settle them */
const makeHandler = () => {
  let release!: () => void
  let started!: () => void
  const running = new Promise<void>((resolve) => (started = resolve))
  const router = {
    slow: os.meta(openapi({ method: 'GET', path: '/slow' })).handler(
      handlerGen(function* () {
        started()
        yield* Effect.callback<void>((resume) => {
          release = () => resume(Effect.void)
        })
        return { ok: true }
      }),
    ),
    failing: os.meta(openapi({ method: 'GET', path: '/failing' })).handler(
      handlerGen(function* () {
        return yield* Effect.fail(connectionTimeout())
      }),
    ),
  }
  const handler = new OpenAPIHandler(router, {
    clientInterceptors: [onError((error, { path, signal }) => reportProcedureError(error, { path, signal }))],
  })
  return { handler, running, release: () => release() }
}

/** Events and breadcrumbs Sentry would have sent; nothing leaves the process */
const events: Sentry.ErrorEvent[] = []
const breadcrumbs: Sentry.Breadcrumb[] = []
const captured = async () => {
  await Sentry.flush(2000)
  return events
}

beforeAll(() => {
  Sentry.init({
    dsn: 'https://public@o0.ingest.sentry.io/0',
    defaultIntegrations: false,
    beforeSend: (event) => {
      events.push(event)
      return null
    },
    beforeBreadcrumb: (breadcrumb) => {
      breadcrumbs.push(breadcrumb)
      return breadcrumb
    },
  })
})

afterAll(async () => {
  await Sentry.close(2000)
})

describe('oRPC error reporting', () => {
  beforeEach(() => {
    events.length = 0
    breadcrumbs.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not capture a request the client aborted mid-flight', async () => {
    const { handler, running } = makeHandler()
    const controller = new AbortController()

    const handled = handler.handle(new Request('http://localhost/slow', { signal: controller.signal }))
    await running
    // What @hono/node-server does when the socket closes: abort with the socket error as a string
    controller.abort('Error: aborted')
    await handled.catch(() => undefined)

    expect(await captured()).toEqual([])
    expect(breadcrumbs).toContainEqual(expect.objectContaining({ message: 'slow aborted by the client' }))
  })

  it('captures a real failure, tagged with the procedure and the SQL error reason', async () => {
    const { handler } = makeHandler()

    const { response } = await handler.handle(new Request('http://localhost/failing'))

    expect(response?.status).toBe(500)
    const sent = await captured()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.exception?.values?.at(-1)?.type).toBe('DatabaseError')
    expect(sent[0]?.tags).toMatchObject({
      'orpc.procedure': 'failing',
      'db.operation': 'Announcements.listPublic',
      'db.error': 'ConnectionError',
    })
  })

  it('captures a real failure of a request whose signal later aborted', async () => {
    const controller = new AbortController()
    controller.abort('Error: aborted')

    reportProcedureError(connectionTimeout(), { path: ['announcements', 'list'], signal: controller.signal })

    expect(await captured()).toHaveLength(1)
  })

  it('recognises only the aborted signal itself as a client abort', () => {
    const controller = new AbortController()
    const abortError = new DOMException('This operation was aborted', 'AbortError')
    expect(isClientAbort('Error: aborted', controller.signal)).toBe(false)
    expect(isClientAbort(abortError, controller.signal)).toBe(false)
    expect(isClientAbort(abortError, undefined)).toBe(false)

    controller.abort('Error: aborted')
    expect(isClientAbort('Error: aborted', controller.signal)).toBe(true)
    expect(isClientAbort(abortError, controller.signal)).toBe(true)
    expect(isClientAbort(new ClientClosedRequestError(), controller.signal)).toBe(true)
    expect(isClientAbort('aborted', controller.signal)).toBe(false)
    expect(isClientAbort(new Error('Error: aborted'), controller.signal)).toBe(false)
  })

  it('tags only database errors', () => {
    expect(databaseErrorTags(new Error('boom'))).toEqual({})
    expect(databaseErrorTags(new DatabaseError({ operation: 'Read', cause: new Error('boom') }))).toEqual({
      'db.operation': 'Read',
    })
  })
})