import { Data, Effect } from 'effect'
import { runMain } from '@effect/platform-node/NodeRuntime'
import { sql } from 'drizzle-orm'
import { Database, DatabaseLive } from './db/index.js'

class ModerationError extends Data.TaggedError('ModerationError')<{ readonly message: string }> {}

// Operator-only CLI: database access is required; there is no public moderation endpoint.
const program = Effect.gen(function* () {
  const [action, rawId] = process.argv.slice(2)
  const database = yield* Database
  if (action === 'list') {
    const result = yield* database.query('List unresolved comment reports', (db) =>
      db.execute(sql`
      SELECT r.id, r.action, r.created_at, c.id AS comment_id, c.content, c.created_by
      FROM comment_reports r JOIN comments c ON c.id = r.comment_id
      WHERE r.resolved_at IS NULL ORDER BY r.created_at LIMIT 100`),
    )
    yield* Effect.sync(() => console.log(JSON.stringify(result.rows, null, 2)))
  } else if ((action === 'remove' || action === 'dismiss') && /^\d+$/.test(rawId ?? '')) {
    yield* database.transaction((tx) =>
      Effect.gen(function* () {
        const { rows } = yield* database.query('Lock comment report', () =>
          tx.execute<{ comment_id: number }>(sql`
        SELECT comment_id FROM comment_reports WHERE id = ${rawId} FOR UPDATE`),
        )
        if (!rows.length) return yield* Effect.fail(new ModerationError({ message: 'Report not found' }))
        if (action === 'remove') {
          yield* database.query('Remove comment', () =>
            tx.execute(sql`
          UPDATE comments SET removed_at = now() WHERE id = ${rows[0].comment_id}`),
          )
          yield* database.query('Resolve comment reports', () =>
            tx.execute(sql`
          UPDATE comment_reports SET resolved_at = now() WHERE comment_id = ${rows[0].comment_id}`),
          )
        } else {
          yield* database.query('Dismiss comment report', () =>
            tx.execute(sql`
          UPDATE comment_reports SET resolved_at = now() WHERE id = ${rawId}`),
          )
        }
      }),
    )
    yield* Effect.logInfo('Report resolved. Viewer hide/block preferences remain in effect.')
  } else {
    return yield* Effect.fail(
      new ModerationError({
        message: 'Usage: pnpm exec tsx src/moderate-comments.ts list|remove <report-id>|dismiss <report-id>',
      }),
    )
  }
})

// The operator CLI is an application entry point; this layer owns its pool.
// @effect-diagnostics-next-line strictEffectProvide:off
runMain(program.pipe(Effect.provide(DatabaseLive)))