/**
 * Migration script: Supabase Auth → Better Auth
 *
 * Migrates users, identities, and application data (profiles, comments, tags, etc.)
 * from a Supabase database to a Better Auth PostgreSQL database.
 *
 * Required env vars:
 *   SUPABASE_DATABASE_URL - Supabase direct connection (port 5432, not pooler)
 *   DATABASE_URL           - Target Better Auth database (auto-loaded from .env / .env.local)
 *
 * Usage:
 *   SUPABASE_DATABASE_URL=postgres://... pnpm exec tsx scripts/migrate-from-supabase.ts
 */

import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { Config, Console, Data, Effect, Exit } from 'effect'
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'

class MigrationQueryError extends Data.TaggedError('MigrationQueryError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

class MigrationConfigurationError extends Data.TaggedError('MigrationConfigurationError')<{
  readonly message: string
}> {}

const databaseOperation = <A>(operation: string, evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new MigrationQueryError({ operation, cause }),
  }).pipe(Effect.uninterruptible)

const query = <Row extends QueryResultRow = QueryResultRow>(
  connection: Pool | PoolClient,
  statement: string,
  parameters?: unknown[],
) => databaseOperation('Execute migration query', () => connection.query<Row>(statement, parameters))

const scopedPool = (connectionString: string) =>
  Effect.acquireRelease(
    Effect.sync(() => new Pool({ connectionString })),
    (pool) => databaseOperation('Close migration pool', () => pool.end()).pipe(Effect.orDie),
  )

const withClient = <A, E, R>(pool: Pool, evaluate: (client: PoolClient) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    databaseOperation('Acquire migration connection', () => pool.connect()),
    (client) => Effect.suspend(() => evaluate(client)),
    (client, exit) => Effect.sync(() => client.release(Exit.isFailure(exit))),
  )

const transaction = <A, E, R>(pool: Pool, evaluate: (client: PoolClient) => Effect.Effect<A, E, R>) =>
  withClient(pool, (client) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        yield* query(client, 'BEGIN')
        const result = yield* Effect.exit(restore(Effect.suspend(() => evaluate(client))))
        if (Exit.isFailure(result)) {
          yield* query(client, 'ROLLBACK')
          return yield* Effect.failCause(result.cause)
        }

        const committed = yield* Effect.exit(query(client, 'COMMIT'))
        if (Exit.isFailure(committed)) {
          yield* query(client, 'ROLLBACK')
          return yield* Effect.failCause(committed.cause)
        }
        return result.value
      }),
    ),
  )

interface SupabaseUser extends QueryResultRow {
  id: string
  email: string
  email_confirmed_at: Date | null
  raw_user_meta_data: Record<string, unknown> | null
  encrypted_password: string | null
  created_at: Date
  updated_at: Date
}

function getName(meta: Record<string, unknown> | null, email: string): string {
  if (meta) {
    if (typeof meta.name === 'string' && meta.name) return meta.name
    if (typeof meta.full_name === 'string' && meta.full_name) return meta.full_name
    if (typeof meta.user_name === 'string' && meta.user_name) return meta.user_name
  }
  return email.split('@')[0] || 'Unknown'
}

function getImage(meta: Record<string, unknown> | null): string | null {
  if (meta) {
    if (typeof meta.avatar_url === 'string' && meta.avatar_url) return meta.avatar_url
    if (typeof meta.picture === 'string' && meta.picture) return meta.picture
  }
  return null
}

const migrateUsers = Effect.fn('migration.users')(function* (source: Pool, target: Pool) {
  yield* Console.log('Phase 1: Migrating users...')

  const { rows: users } = yield* query<SupabaseUser>(
    source,
    `
    SELECT id, email, email_confirmed_at, raw_user_meta_data, encrypted_password, created_at, updated_at
    FROM auth.users
    ORDER BY created_at ASC
  `,
  )

  yield* transaction(target, (client) =>
    Effect.gen(function* () {
      for (const u of users) {
        const meta = u.raw_user_meta_data as Record<string, unknown> | null
        const name = getName(meta, u.email)
        const image = getImage(meta)
        const emailVerified = u.email_confirmed_at != null

        yield* query(
          client,
          `INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
          [u.id, name, u.email, emailVerified, image, u.created_at, u.updated_at],
        )
      }
    }),
  )
  yield* Console.log(`  Migrated ${users.length} users`)
  return users
})

const migrateIdentities = Effect.fn('migration.identities')(function* (
  source: Pool,
  target: Pool,
  users: SupabaseUser[],
) {
  yield* Console.log('Phase 2: Migrating identities...')

  const passwordMap = new Map<string, string>()
  for (const u of users) {
    if (u.encrypted_password && u.encrypted_password !== '' && !u.encrypted_password.startsWith('$2a$10$fake')) {
      passwordMap.set(u.id, u.encrypted_password)
    }
  }

  const { rows: identities } = yield* query(
    source,
    `
    SELECT id, user_id, provider, provider_id, identity_data, created_at, updated_at
    FROM auth.identities
    ORDER BY created_at ASC
  `,
  )

  yield* transaction(target, (client) =>
    Effect.gen(function* () {
      for (const identity of identities) {
        const data = identity.identity_data as Record<string, unknown> | null
        // Use Supabase identity.id as account.id for deterministic idempotency
        const accountId = identity.id

        let providerId: string
        let identityAccountId: string
        let password: string | null = null

        if (identity.provider === 'email') {
          providerId = 'credential'
          identityAccountId = identity.user_id
          password = passwordMap.get(identity.user_id) ?? null
        } else if (identity.provider === 'google') {
          providerId = 'google'
          identityAccountId = (data?.sub as string) || identity.provider_id
        } else if (identity.provider === 'github') {
          providerId = 'github'
          identityAccountId = (data?.sub as string) || identity.provider_id
        } else {
          yield* Console.warn(`  Skipping unknown provider: ${identity.provider} for user ${identity.user_id}`)
          continue
        }

        yield* query(
          client,
          `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
          [
            accountId,
            identityAccountId,
            providerId,
            identity.user_id,
            password,
            identity.created_at,
            identity.updated_at,
          ],
        )
      }
    }),
  )
  yield* Console.log(`  Migrated ${identities.length} identities`)
})

const migrateApplicationData = Effect.fn('migration.applicationData')(function* (source: Pool, target: Pool) {
  yield* Console.log('Phase 3: Migrating application data...')

  return yield* transaction(target, (client) =>
    Effect.gen(function* () {
      // 1. tag_groups (no user FK)
      const { rows: tagGroups } = yield* query(
        source,
        `
      SELECT id, created_at, localized_name, color FROM tag_groups ORDER BY id ASC
    `,
      )
      for (const row of tagGroups) {
        yield* query(
          client,
          `INSERT INTO tag_groups (id, created_at, localized_name, color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
          [row.id, row.created_at, JSON.stringify(row.localized_name), row.color],
        )
      }
      yield* Console.log(`  Migrated ${tagGroups.length} tag_groups`)

      // 2. profiles (PK = user.id)
      const { rows: profiles } = yield* query(
        source,
        `
      SELECT id, created_at, display_name FROM profiles ORDER BY created_at ASC
    `,
      )
      for (const row of profiles) {
        yield* query(
          client,
          `INSERT INTO profiles (id, created_at, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
          [row.id, row.created_at, row.display_name],
        )
      }
      yield* Console.log(`  Migrated ${profiles.length} profiles`)

      // 3. tags (FK: created_by → user, group_id → tag_groups)
      const { rows: tags } = yield* query(
        source,
        `
      SELECT id, created_at, created_by, localized_name, localized_description, group_id
      FROM tags WHERE created_by IS NOT NULL ORDER BY id ASC
    `,
      )
      for (const row of tags) {
        yield* query(
          client,
          `INSERT INTO tags (id, created_at, created_by, localized_name, localized_description, group_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
          [row.id, row.created_at, row.created_by, row.localized_name, row.localized_description, row.group_id],
        )
      }
      yield* Console.log(`  Migrated ${tags.length} tags`)

      // 4. tag_songs (FK: tag_id → tags, created_by → user)
      const { rows: tagSongs } = yield* query(
        source,
        `
      SELECT id, created_at, tag_id, song_id, sheet_type, sheet_difficulty, created_by
      FROM tag_songs WHERE created_by IS NOT NULL ORDER BY id ASC
    `,
      )
      for (const row of tagSongs) {
        yield* query(
          client,
          `INSERT INTO tag_songs (id, created_at, tag_id, song_id, sheet_type, sheet_difficulty, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
          [row.id, row.created_at, row.tag_id, row.song_id, row.sheet_type, row.sheet_difficulty, row.created_by],
        )
      }
      yield* Console.log(`  Migrated ${tagSongs.length} tag_songs`)

      // 5. comments (self-ref parent_id — insert ORDER BY id ASC)
      const { rows: comments } = yield* query(
        source,
        `
      SELECT id, created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content
      FROM comments WHERE created_by IS NOT NULL ORDER BY id ASC
    `,
      )
      for (const row of comments) {
        yield* query(
          client,
          `INSERT INTO comments (id, created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
          [
            row.id,
            row.created_at,
            row.created_by,
            row.song_id,
            row.sheet_type,
            row.sheet_difficulty,
            row.parent_id,
            row.content,
          ],
        )
      }
      yield* Console.log(`  Migrated ${comments.length} comments`)

      // 6. song_aliases (created_by nullable)
      const { rows: songAliases } = yield* query(
        source,
        `
      SELECT id, created_at, song_id, name, created_by FROM song_aliases ORDER BY id ASC
    `,
      )
      for (const row of songAliases) {
        yield* query(
          client,
          `INSERT INTO song_aliases (id, created_at, song_id, name, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
          [row.id, row.created_at, row.song_id, row.name, row.created_by],
        )
      }
      yield* Console.log(`  Migrated ${songAliases.length} song_aliases`)
    }),
  )
})

const resetSequences = Effect.fn('migration.sequences')(function* (target: Pool) {
  yield* Console.log('Phase 4: Resetting sequences...')

  const sequences = [
    { seq: 'tag_groups_id_seq', table: 'tag_groups' },
    { seq: 'tags_id_seq', table: 'tags' },
    { seq: 'tag_songs_id_seq', table: 'tag_songs' },
    { seq: 'comments_id_seq', table: 'comments' },
    { seq: 'song_aliases_id_seq', table: 'song_aliases' },
  ]

  return yield* withClient(target, (client) =>
    Effect.gen(function* () {
      for (const { seq, table } of sequences) {
        yield* query(client, `SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${table}), 1))`)
      }
      yield* Console.log('  Sequences reset')
    }),
  )
})

const main = Effect.scoped(
  Effect.gen(function* () {
    yield* Effect.sync(() => {
      dotenv.config()
      dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })
    })
    const sourceUrl = yield* Config.String('SUPABASE_DATABASE_URL').pipe(
      Effect.filterOrFail(
        (value) => value.length > 0,
        () => new MigrationConfigurationError({ message: 'Missing SUPABASE_DATABASE_URL env var' }),
      ),
    )
    const targetUrl = yield* Config.String('DATABASE_URL').pipe(
      Effect.filterOrFail(
        (value) => value.length > 0,
        () => new MigrationConfigurationError({ message: 'Missing DATABASE_URL env var' }),
      ),
    )
    const source = yield* scopedPool(sourceUrl)
    const target = yield* scopedPool(targetUrl)

    yield* Console.log('Starting migration from Supabase to Better Auth...\n')
    const users = yield* migrateUsers(source, target)
    yield* migrateIdentities(source, target, users)
    yield* migrateApplicationData(source, target)
    yield* resetSequences(target)
    yield* Console.log('\nMigration completed successfully!')
  }),
).pipe(Effect.tapCause((cause) => Console.error('\nMigration failed:', cause)))

NodeRuntime.runMain(main)