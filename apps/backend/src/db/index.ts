import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'
import * as authSchema from './auth-schema.js'
import { config } from '../config.js'
import { Cause, Context, Data, Effect, Exit, Layer } from 'effect'
import type { PoolClient } from 'pg'

export const pool = new Pool({
  connectionString: config.databaseUrl,
})

const makeDb = (connection: Pool | PoolClient) =>
  drizzle(connection, {
    schema: {
      ...schema,
      ...authSchema,
    },
  })

export type AppDatabase = ReturnType<typeof makeDb>

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

const query = <A>(operation: string, evaluate: () => PromiseLike<A>) =>
  Effect.tryPromise({
    try: () => Promise.resolve(evaluate()),
    catch: (cause) => new DatabaseError({ operation, cause }),
  })

export class Database extends Context.Tag('dxrating/Database')<
  Database,
  {
    readonly db: AppDatabase
    readonly pool: Pool
    readonly query: <A>(
      operation: string,
      evaluate: (db: AppDatabase) => PromiseLike<A>,
    ) => Effect.Effect<A, DatabaseError>
    readonly transaction: <A, E, R>(
      evaluate: (tx: AppDatabase) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | DatabaseError, R>
  }
>() {}

export const makeDatabase = (connection: Pool): typeof Database.Service => {
  const client = makeDb(connection)
  return {
    db: client,
    pool: connection,
    // pg queries cannot be cancelled by AbortSignal. Wait for completion before
    // releasing their connection or closing the pool.
    query: (operation, evaluate) => query(operation, () => evaluate(client)).pipe(Effect.uninterruptible),
    transaction: (evaluate) =>
      Effect.scoped(
        Effect.gen(function* () {
          const resource = yield* Effect.acquireRelease(
            query('Acquire transaction connection', () => connection.connect()).pipe(
              Effect.map((client) => ({ client, discard: false })),
            ),
            (resource) => Effect.sync(() => resource.client.release(resource.discard)),
          )
          const connectionClient = resource.client
          return yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const begun = yield* Effect.exit(query('Begin transaction', () => connectionClient.query('BEGIN')))
              if (Exit.isFailure(begun)) {
                resource.discard = true
                return yield* Effect.failCause(begun.cause)
              }

              const result = yield* Effect.exit(restore(Effect.suspend(() => evaluate(makeDb(connectionClient)))))
              if (Exit.isFailure(result)) {
                const rolledBack = yield* Effect.exit(
                  query('Roll back transaction', () => connectionClient.query('ROLLBACK')),
                )
                if (Exit.isFailure(rolledBack)) {
                  resource.discard = true
                  return yield* Effect.failCause(Cause.sequential(result.cause, rolledBack.cause))
                }
                return yield* Effect.failCause(result.cause)
              }

              const committed = yield* Effect.exit(query('Commit transaction', () => connectionClient.query('COMMIT')))
              if (Exit.isFailure(committed)) {
                // A failed COMMIT has an uncertain outcome; never recycle this connection.
                resource.discard = true
                const rolledBack = yield* Effect.exit(
                  query('Roll back transaction', () => connectionClient.query('ROLLBACK')),
                )
                return yield* Effect.failCause(
                  Exit.isFailure(rolledBack) ? Cause.sequential(committed.cause, rolledBack.cause) : committed.cause,
                )
              }
              return result.value
            }),
          )
        }),
      ),
  }
}

export const databaseLayer = (acquire: Effect.Effect<Pool, DatabaseError>) =>
  Layer.scoped(
    Database,
    Effect.acquireRelease(acquire, (resource) =>
      resource.ended ? Effect.void : query('Close database pool', () => resource.end()).pipe(Effect.orDie),
    ).pipe(Effect.map(makeDatabase)),
  )

export const DatabaseLive = databaseLayer(Effect.succeed(pool))