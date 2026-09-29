import * as PgClient from '@effect/sql-pg/PgClient'
import { runMain } from '@effect/platform-node/NodeRuntime'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Config, Effect } from 'effect'

runMain(
  Effect.gen(function* () {
    const database = yield* PgDrizzle.makeWithDefaults()
    yield* migrate(database, { migrationsFolder: './drizzle' })
    yield* Effect.logInfo('Migrations applied successfully')
  }).pipe(
    // The migration executable owns this layer and its connection lifetime.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(
      PgClient.layerConfig({
        url: Config.Redacted('DATABASE_URL'),
        maxConnections: Config.succeed(1),
        applicationName: Config.succeed('dxrating-migrate'),
      }),
    ),
  ),
)