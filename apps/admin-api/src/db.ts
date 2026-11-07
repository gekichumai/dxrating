import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Context, Data, Effect, Layer } from 'effect'
import pg from 'pg'
import { AdminApiConfigService } from './config'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

/** The admin API's own pool, as the restricted role `dxrating_admin`. The schema comes from apps/backend. */
export class AdminDatabase extends Context.Service<
  AdminDatabase,
  {
    readonly use: <A>(operation: string, run: (db: NodePgDatabase) => Promise<A>) => Effect.Effect<A, DatabaseError>
  }
>()('dxrating-admin/Database') {}

export const adminDatabaseFromPool = (pool: pg.Pool) => {
  const db = drizzle({ client: pool })
  return Layer.succeed(AdminDatabase, {
    use: (operation, run) =>
      Effect.tryPromise({ try: () => run(db), catch: (cause) => new DatabaseError({ operation, cause }) }),
  })
}

export const AdminDatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AdminApiConfigService
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => new pg.Pool({ connectionString: config.DATABASE_URL, max: 4 })),
      (pool) => Effect.promise(() => pool.end()),
    )
    return adminDatabaseFromPool(pool)
  }),
)