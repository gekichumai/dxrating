import * as PgClient from '@effect/sql-pg/PgClient'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Context, Data, Effect, Layer, Redacted } from 'effect'
import { isSqlError } from 'effect/sql/SqlError'
import { Pool } from 'pg'
import { config } from '../config'

export const pool = new Pool({ connectionString: config.databaseUrl, max: 5 })

export type AppDatabase = Effect.Success<ReturnType<typeof PgDrizzle.makeWithDefaults>>
type AuthDatabase = ReturnType<typeof makeAuthDatabase>
const makeAuthDatabase = (connection: Pool) => drizzle({ client: connection })

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

export class Database extends Context.Service<
  Database,
  {
    readonly db: AppDatabase
    readonly authDb: AuthDatabase
    readonly pool: Pool
    readonly sql: PgClient.PgClient
    readonly query: <A, E, R>(
      operation: string,
      evaluate: (db: AppDatabase) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, DatabaseError, R>
    readonly raw: <A extends object = Record<string, unknown>>(
      operation: string,
      text: string,
      values?: readonly unknown[],
    ) => Effect.Effect<{ rows: A[] }, DatabaseError>
    readonly transaction: <A, E, R>(
      evaluate: (tx: AppDatabase) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | DatabaseError, R>
  }
>()('dxrating/Database') {}

export const makeDatabase = (connection: Pool) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.makeWithDefaults()
    const sql = yield* PgClient.PgClient
    const query: typeof Database.Service.query = (operation, evaluate) =>
      Effect.suspend(() => evaluate(db)).pipe(
        Effect.mapError((cause) => new DatabaseError({ operation, cause })),
        Effect.withSpan(operation),
      )

    return Database.of({
      db,
      authDb: makeAuthDatabase(connection),
      pool: connection,
      sql,
      query,
      raw: <A extends object>(operation: string, text: string, values: readonly unknown[] = []) =>
        sql.unsafe<A>(text, values).pipe(
          Effect.map((rows) => ({ rows: Array.from(rows) })),
          Effect.mapError((cause) => new DatabaseError({ operation, cause })),
          Effect.withSpan(operation),
        ),
      transaction: (evaluate) =>
        sql
          .withTransaction(Effect.suspend(() => evaluate(db)))
          .pipe(
            Effect.mapError((cause) =>
              isSqlError(cause) ? new DatabaseError({ operation: 'Database transaction', cause }) : cause,
            ),
          ),
    })
  })

class AuthPool extends Context.Service<AuthPool, Pool>()('dxrating/AuthPool') {}

export const databaseLayer = (
  acquire: Effect.Effect<Pool, DatabaseError>,
  nativeOptions: PgClient.PgPoolConfig = {
    url: Redacted.make(config.databaseUrl),
    maxConnections: 5,
    applicationName: 'dxrating-effect',
  },
) => {
  const authPoolLayer = Layer.effect(
    AuthPool,
    Effect.acquireRelease(acquire, (resource) => (resource.ended ? Effect.void : Effect.promise(() => resource.end()))),
  )
  return Layer.effect(Database, Effect.flatMap(AuthPool, makeDatabase)).pipe(
    Layer.provide(Layer.mergeAll(authPoolLayer, PgClient.layer(nativeOptions))),
  )
}

export const DatabaseLive = databaseLayer(Effect.succeed(pool))