import { Data, Effect } from 'effect'
import { runMain } from '@effect/platform-node/NodeRuntime'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
class MigrationError extends Data.TaggedError('MigrationError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

runMain(
  Effect.scoped(
    Effect.gen(function* () {
      const pool = yield* Effect.acquireRelease(
        Effect.sync(() => new Pool({ connectionString: process.env.DATABASE_URL })),
        (resource) =>
          Effect.tryPromise({
            try: () => resource.end(),
            catch: (cause) => new MigrationError({ operation: 'Close migration pool', cause }),
          }).pipe(Effect.orDie),
      )
      // Drizzle migration promises do not support cancellation; let them settle
      // before releasing the database connection, including on process shutdown.
      yield* Effect.tryPromise({
        try: () => migrate(drizzle(pool), { migrationsFolder: './drizzle' }),
        catch: (cause) => new MigrationError({ operation: 'Apply database migrations', cause }),
      }).pipe(Effect.uninterruptible)
      yield* Effect.logInfo('Migrations applied successfully')
    }),
  ),
)