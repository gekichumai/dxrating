import { Data, Effect } from 'effect'
import { runMain } from '@effect/platform-node/NodeRuntime'
import { sql } from 'drizzle-orm'
import { Database, DatabaseLive } from './db/index'
import { FEATURE_FLAGS, isFeatureFlag } from './services/feature-flag-names'

class FlagSetError extends Data.TaggedError('FlagSetError')<{ readonly message: string }> {}

const USAGE = `Usage: pnpm --filter @gekichumai/backend flag:set <${FEATURE_FLAGS.join('|')}> <email> on|off
In the production image: node dist/flag-set.js <flag> <email> on|off`

// Operator-only CLI until the admin console ships: it upserts an `admin` override
// for one user. Running servers pick the change up within their 60-second cache.
// CLOUD_SAVE_MODE=off and SERVER_IMPORTS=off still override every row.
const program = Effect.gen(function* () {
  const [flag, email, state] = process.argv.slice(2)
  if (!flag || !isFeatureFlag(flag) || !email || (state !== 'on' && state !== 'off')) {
    return yield* Effect.fail(new FlagSetError({ message: USAGE }))
  }
  const enabled = state === 'on'
  const database = yield* Database
  const rows = yield* database.query('Set feature flag override', (db) =>
    db.execute<{ user_id: string; enabled: boolean; email_verified: boolean }>(
      sql`
      WITH target AS (SELECT id, email_verified FROM "user" WHERE lower(email) = lower(${email})),
      upserted AS (
        INSERT INTO feature_flag_overrides (flag, user_id, enabled, source)
        SELECT ${flag}, id, ${enabled}, 'admin' FROM target
        ON CONFLICT (flag, user_id) DO UPDATE
          SET enabled = excluded.enabled, source = 'admin', updated_at = now()
        RETURNING user_id, enabled
      )
      SELECT upserted.user_id, upserted.enabled, target.email_verified
      FROM upserted JOIN target ON target.id = upserted.user_id`,
      'objects',
    ),
  )
  if (rows.length === 0) return yield* Effect.fail(new FlagSetError({ message: 'No user has this email' }))
  // Email/password sign-up does not verify addresses: check an unverified match is the right person.
  const row = rows[0]!
  const verified = row.email_verified ? 'verified' : 'NOT verified'
  yield* Effect.logInfo(`Set ${flag}=${state} (admin) for user ${row.user_id} (email ${verified})`)
})

// The operator CLI is an application entry point; this layer owns its pool.
// @effect-diagnostics-next-line strictEffectProvide:off
runMain(program.pipe(Effect.provide(DatabaseLive)))