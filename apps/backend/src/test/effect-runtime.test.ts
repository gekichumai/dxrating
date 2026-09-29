import { sql } from 'drizzle-orm'
import {
  Cause,
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  TestClock,
  TestContext,
} from 'effect'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Database, DatabaseError, databaseLayer, makeDatabase } from '../db/index'
import { ApplicationCache, ApplicationCacheLive } from '../services/cache'
import { HttpClient, makeHttpClient } from '../services/http-client'
describe('Effect database transactions', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  const database = makeDatabase(pool)
  const insert = database.transaction((tx) =>
    Effect.promise(() => tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('committed')`)),
  )
  beforeAll(async () => {
    await pool.query('CREATE TABLE effect_transaction_probe (value text NOT NULL)')
  })
  beforeEach(async () => {
    await pool.query('DELETE FROM effect_transaction_probe')
  })
  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS effect_transaction_probe')
    await pool.end()
  })
  it('commits successful writes and returns the connection to the pool', async () => {
    await Effect.runPromise(insert)
    expect((await pool.query('SELECT value FROM effect_transaction_probe')).rows).toEqual([{ value: 'committed' }])
    expect(pool.idleCount).toBe(1)
  })
  it('rolls back persisted writes and preserves the typed failure', async () => {
    const failure = new TransactionFailure({ message: 'Intentional transaction failure' })
    const exit = await Effect.runPromiseExit(
      database.transaction((tx) =>
        Effect.promise(() => tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('rolled back')`)).pipe(
          Effect.andThen(Effect.fail(failure)),
        ),
      ),
    )
    expect(exit).toEqual(Exit.fail(failure))
    expect((await pool.query('SELECT value FROM effect_transaction_probe')).rows).toEqual([])
    expect(pool.idleCount).toBe(1)
  })
  it('rolls back writes when application code defects', async () => {
    const defect = new Error('Unexpected transaction defect')
    const exit = await Effect.runPromiseExit(
      database.transaction((tx) =>
        Effect.promise(() => tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('rolled back')`)).pipe(
          Effect.andThen(Effect.die(defect)),
        ),
      ),
    )
    expect(Exit.isFailure(exit) && Cause.dieOption(exit.cause)).toEqual(Option.some(defect))
    expect((await pool.query('SELECT value FROM effect_transaction_probe')).rows).toEqual([])
    expect(pool.idleCount).toBe(1)
  })
  it('rolls back a cancelled transaction before releasing its connection', async () => {
    const written = await Effect.runPromise(Deferred.make<void>())
    const transaction = database.transaction((tx) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => tx.execute(sql`INSERT INTO effect_transaction_probe (value) VALUES ('cancelled')`))
        yield* Deferred.succeed(written, undefined)
        return yield* Effect.never
      }),
    )
    const fiber = Effect.runFork(transaction)
    await Effect.runPromise(Deferred.await(written))
    const exit = await Effect.runPromise(Fiber.interrupt(fiber))
    expect(Exit.isInterrupted(exit)).toBe(true)
    expect((await pool.query('SELECT value FROM effect_transaction_probe')).rows).toEqual([])
    expect(pool.idleCount).toBe(1)
  })
  it('retains the native database failure as the typed error cause', async () => {
    const exit = await Effect.runPromiseExit(
      database.query('Read missing column', (db) =>
        db.execute(sql`SELECT nonexistent_column FROM effect_transaction_probe`),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error('Expected a database failure')
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause))
    expect(failure).toBeInstanceOf(DatabaseError)
    expect(failure.operation).toBe('Read missing column')
    expect(failure.cause).toBeInstanceOf(Error)
  })
})
describe('Effect runtime resource ownership', () => {
  it('acquires one database service and closes its pool exactly once', async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const close = vi.spyOn(pool, 'end')
    const runtime = ManagedRuntime.make(databaseLayer(Effect.succeed(pool)))
    const query = Effect.gen(function* () {
      const database = yield* Database
      return yield* database.query('Check connection', (db) => db.execute(sql`SELECT 1 AS value`))
    })
    try {
      expect((await runtime.runPromise(query)).rows).toEqual([{ value: 1 }])
      expect((await runtime.runPromise(query)).rows).toEqual([{ value: 1 }])
      expect(close).not.toHaveBeenCalled()
    } finally {
      await runtime.dispose()
      await runtime.dispose()
    }
    expect(close).toHaveBeenCalledTimes(1)
  })
})
describe('Effect transaction driver failures', () => {
  const fixture = (failures: Readonly<Record<string, Error>> = {}) => {
    const release = vi.fn()
    const query = vi.fn(async (statement: string) => {
      if (failures[statement]) throw failures[statement]
      return { rows: [] }
    })
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool
    return { database: makeDatabase(pool), release, query }
  }
  it('discards an ambiguous commit connection even when cleanup rollback succeeds', async () => {
    const commitFailure = new Error('Connection lost during commit')
    const { database, release, query } = fixture({ COMMIT: commitFailure })
    const exit = await Effect.runPromiseExit(database.transaction(() => Effect.succeed('written')))
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error('Expected commit failure')
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))).toMatchObject({
      _tag: 'DatabaseError',
      operation: 'Commit transaction',
      cause: commitFailure,
    })
    expect(query.mock.calls.flat()).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK'])
    expect(release).toHaveBeenCalledExactlyOnceWith(true)
  })
  it('preserves both primary and rollback failures and discards the broken connection', async () => {
    const primary = new TransactionFailure({ message: 'Application write rejected' })
    const rollbackFailure = new Error('Connection lost during rollback')
    const { database, release } = fixture({ ROLLBACK: rollbackFailure })
    const exit = await Effect.runPromiseExit(database.transaction(() => Effect.fail(primary)))
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error('Expected combined failure')
    const failures = Array.from(Cause.failures(exit.cause))
    expect(failures).toHaveLength(2)
    expect(failures[0]).toBe(primary)
    expect(failures[1]).toMatchObject({
      _tag: 'DatabaseError',
      operation: 'Roll back transaction',
      cause: rollbackFailure,
    })
    expect(release).toHaveBeenCalledExactlyOnceWith(true)
  })
  it('retains both commit and rollback failures when the connection dies', async () => {
    const commitFailure = new Error('Commit failed')
    const rollbackFailure = new Error('Rollback failed')
    const { database, release } = fixture({ COMMIT: commitFailure, ROLLBACK: rollbackFailure })
    const exit = await Effect.runPromiseExit(database.transaction(() => Effect.void))
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error('Expected combined failure')
    expect(Array.from(Cause.failures(exit.cause))).toMatchObject([
      { operation: 'Commit transaction', cause: commitFailure },
      { operation: 'Roll back transaction', cause: rollbackFailure },
    ])
    expect(release).toHaveBeenCalledExactlyOnceWith(true)
  })
  it('discards a connection that fails to begin and does not execute application writes', async () => {
    const { database, release, query } = fixture({ BEGIN: new Error('Cannot begin transaction') })
    const write = vi.fn(() => Effect.void)
    const exit = await Effect.runPromiseExit(database.transaction(write))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(write).not.toHaveBeenCalled()
    expect(query.mock.calls.flat()).toEqual(['BEGIN'])
    expect(release).toHaveBeenCalledExactlyOnceWith(true)
  })
  it('returns a healthy connection to the pool after a successful rollback', async () => {
    const failure = new TransactionFailure({ message: 'Expected domain failure' })
    const { database, release, query } = fixture()
    expect(await Effect.runPromiseExit(database.transaction(() => Effect.fail(failure)))).toEqual(Exit.fail(failure))
    expect(query.mock.calls.flat()).toEqual(['BEGIN', 'ROLLBACK'])
    expect(release).toHaveBeenCalledExactlyOnceWith(false)
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
    const http = makeHttpClient(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined
          requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true })
          requestStarted()
        }),
    )
    const controller = new AbortController()
    const response = Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* HttpClient
          return yield* client.request('https://example.invalid')
        }).pipe(Effect.provideService(HttpClient, http)),
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
    const http = makeHttpClient(async (_url, init) => {
      requestSignal = init?.signal ?? undefined
      requestSignal?.addEventListener('abort', () => bodyController.error(requestSignal?.reason), { once: true })
      return new Response(body)
    })
    const controller = new AbortController()
    const response = Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* HttpClient
          const headers = yield* client.request('https://example.invalid/stream')
          return yield* client.json(headers)
        }).pipe(Effect.provideService(HttpClient, http)),
      ),
      { signal: controller.signal },
    )
    const rejected = expect(response).rejects.toBeDefined()
    await reading
    controller.abort()
    await rejected
    expect(requestSignal?.aborted).toBe(true)
  })
})
describe('Effect cache lifetime', () => {
  it('expires entries at their TTL and makes invalidation visible immediately', async () => {
    const runtime = ManagedRuntime.make(Layer.merge(ApplicationCacheLive, TestContext.TestContext))
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