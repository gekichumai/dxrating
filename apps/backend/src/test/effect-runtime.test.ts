import { sql } from 'drizzle-orm'
import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { Cause, Data, Deferred, Effect, Exit, Layer, ManagedRuntime, Option, Redacted, Result } from 'effect'
import { FetchHttpClient, HttpBody } from 'effect/http'
import { TestClock } from 'effect/testing'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Database, DatabaseError, databaseLayer } from '../db/index'
import { ApplicationCache, ApplicationCacheLive } from '../services/cache'
import { HttpClient, HttpClientLive } from '../services/http-client'

const typeProbe = pgTable('effect_type_probe', {
  externalId: bigint('external_id', { mode: 'bigint' }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  details: jsonb('details').$type<{ label: string }>().notNull(),
  labels: text('labels').array().notNull(),
})

const nativeOptions = (applicationName: string) => ({
  url: Redacted.make(process.env.DATABASE_URL!),
  maxConnections: 1,
  applicationName,
})

describe('native Effect database transactions', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  const runtime = ManagedRuntime.make(
    databaseLayer(Effect.succeed(pool), nativeOptions('dxrating-effect-transactions-test')),
  )
  let database: typeof Database.Service

  const rows = () =>
    pool.query('SELECT value FROM effect_transaction_probe ORDER BY value').then((result) => result.rows)
  const ensureUsable = () => Effect.runPromise(database.raw('Check native connection', 'SELECT 1::integer AS value'))

  beforeAll(async () => {
    database = await runtime.runPromise(Database)
    await pool.query('CREATE TABLE effect_transaction_probe (value text NOT NULL)')
    await pool.query(
      'CREATE TABLE effect_type_probe (external_id bigint NOT NULL, recorded_at timestamptz NOT NULL, details jsonb NOT NULL, labels text[] NOT NULL)',
    )
  })
  beforeEach(async () => {
    await pool.query('DELETE FROM effect_transaction_probe')
    await pool.query('DELETE FROM effect_type_probe')
  })
  afterAll(async () => {
    try {
      await pool.query('DROP TABLE IF EXISTS effect_type_probe, effect_transaction_probe')
    } finally {
      await runtime.dispose()
    }
  })

  it('commits native Drizzle writes and returns a usable connection', async () => {
    await Effect.runPromise(
      database.transaction((tx) => tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('committed')`)),
    )
    expect(await rows()).toEqual([{ value: 'committed' }])
    expect(await ensureUsable()).toEqual({ rows: [{ value: 1 }] })
  })

  it('rolls back persisted writes and preserves the typed failure', async () => {
    const failure = new TransactionFailure({ message: 'Intentional transaction failure' })
    const exit = await Effect.runPromiseExit(
      database.transaction((tx) =>
        tx
          .execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('rolled back')`)
          .pipe(Effect.andThen(Effect.fail(failure))),
      ),
    )
    expect(exit).toEqual(Exit.fail(failure))
    expect(await rows()).toEqual([])
    expect(await ensureUsable()).toEqual({ rows: [{ value: 1 }] })
  })

  it('rolls back writes when application code defects', async () => {
    const defect = new Error('Unexpected transaction defect')
    const exit = await Effect.runPromiseExit(
      database.transaction((tx) =>
        tx
          .execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('rolled back')`)
          .pipe(Effect.andThen(Effect.die(defect))),
      ),
    )
    expect(Exit.isFailure(exit) && Cause.findDefect(exit.cause)).toEqual(Result.succeed(defect))
    expect(await rows()).toEqual([])
    expect(await ensureUsable()).toEqual({ rows: [{ value: 1 }] })
  })

  it('rolls back a cancelled transaction before releasing its connection', async () => {
    const written = await Effect.runPromise(Deferred.make<void>())
    const controller = new AbortController()
    const pending = Effect.runPromiseExit(
      database.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('cancelled')`)
          yield* Deferred.succeed(written, undefined)
          return yield* Effect.never
        }),
      ),
      { signal: controller.signal },
    )
    await Effect.runPromise(Deferred.await(written))
    controller.abort()
    expect(Exit.hasInterrupts(await pending)).toBe(true)
    expect(await rows()).toEqual([])
    expect(await ensureUsable()).toEqual({ rows: [{ value: 1 }] })
  })

  it('shares transaction ownership between Drizzle and raw Effect SQL', async () => {
    const failure = new TransactionFailure({ message: 'Rollback both clients' })
    await Effect.runPromise(
      Effect.result(
        database.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('drizzle')`)
            yield* database.raw('Insert native SQL', 'INSERT INTO effect_transaction_probe (value) VALUES ($1)', [
              'raw',
            ])
            return yield* Effect.fail(failure)
          }),
        ),
      ),
    )
    expect(await rows()).toEqual([])
  })

  it('cancels an active SQL statement before reusing the single native connection', async () => {
    const controller = new AbortController()
    const pending = Effect.runPromiseExit(database.raw('Interrupt native query', 'SELECT pg_sleep(20)'), {
      signal: controller.signal,
    })
    try {
      await expect
        .poll(
          async () => {
            const result = await pool.query(
              "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name = $1 AND state = 'active' AND query = 'SELECT pg_sleep(20)'",
              ['dxrating-effect-transactions-test'],
            )
            return result.rows[0].count
          },
          { timeout: 2_000, interval: 10 },
        )
        .toBe(1)
      controller.abort()
      expect(Exit.hasInterrupts(await pending)).toBe(true)
      expect(await ensureUsable()).toEqual({ rows: [{ value: 1 }] })
    } finally {
      controller.abort()
      await pending
    }
  })

  it('rolls back a nested transaction to its savepoint while committing the outer writes', async () => {
    await Effect.runPromise(
      database.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('outer')`)
          yield* database
            .transaction((nested) =>
              nested
                .execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('inner')`)
                .pipe(Effect.andThen(Effect.fail(new TransactionFailure({ message: 'Inner rollback' })))),
            )
            .pipe(Effect.catchTag('TransactionFailure', () => Effect.void))
          yield* tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('after')`)
        }),
      ),
    )
    expect(await rows()).toEqual([{ value: 'after' }, { value: 'outer' }])
  })

  it('retains native query errors with the operation context', async () => {
    const exit = await Effect.runPromiseExit(
      database.query('Read missing column', (db) =>
        db.execute(sql`SELECT nonexistent_column FROM effect_transaction_probe`),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error('Expected a database failure')
    const failure = Option.getOrThrow(Cause.findErrorOption(exit.cause))
    expect(failure).toBeInstanceOf(DatabaseError)
    expect(failure.operation).toBe('Read missing column')
    expect(failure.cause).toBeInstanceOf(Error)
  })

  it('rejects a commit after a swallowed SQL error and makes the pool usable again', async () => {
    const exit = await Effect.runPromiseExit(
      database.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('aborted')`)
          yield* tx.execute(sql`SELECT 1 / 0`).pipe(Effect.ignore)
        }),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(await rows()).toEqual([])
    expect(await ensureUsable()).toEqual({ rows: [{ value: 1 }] })
  })

  it('replaces a connection terminated during a transaction without committing its writes', async () => {
    const entered = Promise.withResolvers<number>()
    const resume = Promise.withResolvers<void>()
    const pending = Effect.runPromiseExit(
      database.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('terminated')`)
          const { rows } = yield* database.raw('Read transaction connection', 'SELECT pg_backend_pid() AS pid')
          expect.assert(typeof rows[0].pid === 'number')
          entered.resolve(rows[0].pid)
          yield* Effect.promise(() => resume.promise)
          return yield* tx.execute(sql`SELECT 1`, 'objects')
        }),
      ),
    )
    const pid = await entered.promise
    try {
      await pool.query('SELECT pg_terminate_backend($1)', [pid])
    } finally {
      resume.resolve()
    }
    expect(Exit.isFailure(await pending)).toBe(true)
    expect(await rows()).toEqual([])
    expect(await ensureUsable()).toEqual({ rows: [{ value: 1 }] })
  })

  it('round trips timestamps, bigint IDs, JSONB and arrays through native Drizzle', async () => {
    const value = {
      externalId: 9007199254740993n,
      recordedAt: new Date('2026-09-29T04:05:06.789Z'),
      details: { label: '日本語' },
      labels: ['alpha', 'quoted,value', '日本語'],
    }
    await Effect.runPromise(database.db.insert(typeProbe).values(value))
    expect(await Effect.runPromise(database.db.select().from(typeProbe))).toEqual([value])
  })
})

describe('Effect runtime resource ownership', () => {
  it('shares one service and closes its native and Better Auth pools exactly once', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const observer = new Pool({ connectionString: process.env.DATABASE_URL })
    const close = vi.spyOn(pool, 'end')
    const applicationName = 'dxrating-effect-ownership-test'
    const runtime = ManagedRuntime.make(databaseLayer(Effect.succeed(pool), nativeOptions(applicationName)))
    const query = Effect.gen(function* () {
      const database = yield* Database
      return yield* database.raw('Check connection', 'SELECT 1::integer AS value')
    })
    try {
      const first = await runtime.runPromise(Database)
      expect(await runtime.runPromise(Database)).toBe(first)
      expect(await runtime.runPromise(query)).toEqual({ rows: [{ value: 1 }] })
      expect(await runtime.runPromise(query)).toEqual({ rows: [{ value: 1 }] })
      expect(close).not.toHaveBeenCalled()
      await runtime.dispose()
      await runtime.dispose()
      expect(close).toHaveBeenCalledTimes(1)
      await expect
        .poll(
          async () =>
            (await observer.query('SELECT pid FROM pg_stat_activity WHERE application_name = $1', [applicationName]))
              .rows,
        )
        .toEqual([])
    } finally {
      await runtime.dispose()
      await observer.end()
    }
  })
})
describe('Effect framework boundary', () => {
  it('runs finalizers before reporting cancellation to a framework caller', async () => {
    const acquired = await Effect.runPromise(Deferred.make<void>())
    const controller = new AbortController()
    let released = false
    const response = Effect.runPromise(
      Effect.scoped(
        Effect.acquireRelease(Deferred.succeed(acquired, undefined), () =>
          Effect.sync(() => {
            released = true
          }),
        ).pipe(Effect.andThen(Effect.never), Effect.scoped),
      ),
      { signal: controller.signal },
    )
    const rejected = expect(response).rejects.toBeDefined()
    await Effect.runPromise(Deferred.await(acquired))
    controller.abort()
    await rejected
    expect(released).toBe(true)
  })
  it('aborts foreign HTTP requests when the request fiber is cancelled', async () => {
    let requestSignal: AbortSignal | undefined
    let requestStarted!: () => void
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve
    })
    const http = HttpClientLive.pipe(
      Layer.provide(
        Layer.succeed(
          FetchHttpClient.Fetch,
          (_url, init) =>
            new Promise((_resolve, reject) => {
              requestSignal = init?.signal ?? undefined
              requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true })
              requestStarted()
            }),
        ),
      ),
    )
    await using runtime = ManagedRuntime.make(http)
    const controller = new AbortController()
    const response = runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* HttpClient
          return yield* client.get('https://example.invalid')
        }),
      ),
      { signal: controller.signal },
    )
    const rejected = expect(response).rejects.toBeDefined()
    await started
    controller.abort()
    await rejected
    expect(requestSignal?.aborted).toBe(true)
  })
  it('keeps cancellation attached after headers arrive and aborts a pending JSON body', async () => {
    let requestSignal: AbortSignal | undefined
    let bodyController!: ReadableStreamDefaultController<Uint8Array>
    let reportReading!: () => void
    const reading = new Promise<void>((resolve) => {
      reportReading = resolve
    })
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          bodyController = controller
        },
        pull() {
          reportReading()
        },
      },
      { highWaterMark: 0 },
    )
    const http = HttpClientLive.pipe(
      Layer.provide(
        Layer.succeed(FetchHttpClient.Fetch, async (_url, init) => {
          requestSignal = init?.signal ?? undefined
          requestSignal?.addEventListener('abort', () => bodyController.error(requestSignal?.reason), { once: true })
          return new Response(body)
        }),
      ),
    )
    await using runtime = ManagedRuntime.make(http)
    const controller = new AbortController()
    const response = runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* HttpClient
          const headers = yield* client.get('https://example.invalid/stream')
          return yield* headers.json
        }),
      ),
      { signal: controller.signal },
    )
    const rejected = expect(response).rejects.toBeDefined()
    await reading
    controller.abort()
    await rejected
    expect(requestSignal?.aborted).toBe(true)
  })
  it('preserves HTTP request and response semantics and closes an unread body with its scope', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ message: 'teapot' }, { status: 418, headers: { 'Cache-Control': 'no-store' } }),
      )
    const http = HttpClientLive.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, upstream)))
    await using runtime = ManagedRuntime.make(http)
    await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* HttpClient
          const response = yield* client.post('https://example.invalid/resource?key=value', {
            headers: { Authorization: 'Bearer synthetic-token' },
            body: HttpBody.jsonUnsafe({ input: 'test' }),
          })
          expect(response.status).toBe(418)
          expect(response.headers['cache-control']).toBe('no-store')
          expect(yield* response.json).toEqual({ message: 'teapot' })
          expect(yield* response.json).toEqual({ message: 'teapot' })
        }),
      ),
    )
    const [url, init] = upstream.mock.calls[0]
    expect(url instanceof Request ? url.url : url.toString()).toBe('https://example.invalid/resource?key=value')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-token')
    expect(await new Response(init?.body).json()).toEqual({ input: 'test' })
    expect(init?.signal?.aborted).toBe(true)
    expect(upstream).toHaveBeenCalledTimes(1)

    upstream.mockResolvedValueOnce(new Response('unread response'))
    await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* HttpClient
          yield* client.get('https://example.invalid/unread')
        }),
      ),
    )
    expect(upstream.mock.calls[1][1]?.signal?.aborted).toBe(true)
  })
})
describe('Effect cache lifetime', () => {
  it('expires entries at their TTL and makes invalidation visible immediately', async () => {
    const runtime = ManagedRuntime.make(Layer.merge(ApplicationCacheLive, TestClock.layer()))
    try {
      await runtime.runPromise(
        Effect.gen(function* () {
          const cache = yield* ApplicationCache
          yield* cache.set('tags:list', ['one'])
          yield* TestClock.adjust('29 minutes')
          expect(yield* cache.get('tags:list')).toEqual(['one'])
          yield* TestClock.adjust('1 minute')
          expect(yield* cache.get('tags:list')).toBeUndefined()
          yield* cache.set('tags:list', ['two'])
          yield* cache.delete('tags:list')
          expect(yield* cache.get('tags:list')).toBeUndefined()
        }),
      )
    } finally {
      await runtime.dispose()
    }
  })
})

class TransactionFailure extends Data.TaggedError('TransactionFailure')<{ readonly message: string }> {}