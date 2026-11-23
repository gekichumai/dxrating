import { pgTable, text } from 'drizzle-orm/pg-core'
import { Cause, Effect, Exit, ManagedRuntime, Redacted } from 'effect'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Database, databaseLayer } from '../db/index'

const probe = pgTable('query_cache_probe', { value: text('value').notNull() })

describe('cached selects', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  const runtime = ManagedRuntime.make(
    databaseLayer(Effect.succeed(pool), {
      url: Redacted.make(process.env.DATABASE_URL!),
      maxConnections: 2,
      applicationName: 'dxrating-query-cache-test',
    }),
  )
  const withDatabase = <A, E, R>(use: (database: typeof Database.Service) => Effect.Effect<A, E, R>) =>
    Effect.flatMap(Database, use)
  const cachedValues = withDatabase((database) =>
    database.query('Probe.list', (db) => db.select().from(probe).$withCache()),
  )
  const insert = (value: string) =>
    withDatabase((database) => database.query('Probe.insert', (db) => db.insert(probe).values({ value })))

  beforeAll(() => pool.query('CREATE TABLE query_cache_probe (value text NOT NULL)'))
  beforeEach(() =>
    runtime.runPromise(withDatabase((database) => database.query('Probe.clear', (db) => db.delete(probe)))),
  )
  afterAll(async () => {
    try {
      await pool.query('DROP TABLE IF EXISTS query_cache_probe')
    } finally {
      await runtime.dispose()
    }
  })

  it('serves the next read after a write from the database', async () => {
    expect(await runtime.runPromise(cachedValues)).toEqual([])
    await runtime.runPromise(insert('written'))
    expect(await runtime.runPromise(cachedValues)).toEqual([{ value: 'written' }])
  })

  it('serves a transaction write once it commits, though another read cached the old rows meanwhile', async () => {
    expect(await runtime.runPromise(cachedValues)).toEqual([])
    const readDuring = await runtime.runPromise(
      withDatabase((database) =>
        database.transaction(() =>
          insert('committed').pipe(Effect.andThen(Effect.promise(() => runtime.runPromise(cachedValues)))),
        ),
      ),
    )
    expect(readDuring).toEqual([])
    expect(await runtime.runPromise(cachedValues)).toEqual([{ value: 'committed' }])
  })

  it('refuses an entry named by hand', async () => {
    const exit = await runtime.runPromiseExit(
      withDatabase((database) =>
        database.query('Probe.tagged', (db) => db.select().from(probe).$withCache({ tag: 'probe:list' })),
      ),
    )
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
  })
})