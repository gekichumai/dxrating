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
 *   SUPABASE_DATABASE_URL=postgres://... npx tsx scripts/migrate-from-supabase.ts
 */

import * as path from 'node:path'
import * as dotenv from 'dotenv'
import * as pg from 'pg'

dotenv.config()
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })

const { Pool } = pg

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL

if (!SUPABASE_DATABASE_URL) {
  console.error('Missing SUPABASE_DATABASE_URL env var')
  process.exit(1)
}
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL env var')
  process.exit(1)
}

const source = new Pool({ connectionString: SUPABASE_DATABASE_URL })
const target = new Pool({ connectionString: DATABASE_URL })

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

async function migrateUsers() {
  console.log('Phase 1: Migrating users...')

  const { rows: users } = await source.query(`
    SELECT id, email, email_confirmed_at, raw_user_meta_data, encrypted_password, created_at, updated_at
    FROM auth.users
    ORDER BY created_at ASC
  `)

  const client = await target.connect()
  try {
    await client.query('BEGIN')

    for (const u of users) {
      const meta = u.raw_user_meta_data as Record<string, unknown> | null
      const name = getName(meta, u.email)
      const image = getImage(meta)
      const emailVerified = u.email_confirmed_at != null

      await client.query(
        `INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, name, u.email, emailVerified, image, u.created_at, u.updated_at],
      )
    }

    await client.query('COMMIT')
    console.log(`  Migrated ${users.length} users`)
    return users
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function migrateIdentities(users: Array<{ id: string; encrypted_password: string }>) {
  console.log('Phase 2: Migrating identities...')

  const passwordMap = new Map<string, string>()
  for (const u of users) {
    if (u.encrypted_password && u.encrypted_password !== '' && !u.encrypted_password.startsWith('$2a$10$fake')) {
      passwordMap.set(u.id, u.encrypted_password)
    }
  }

  const { rows: identities } = await source.query(`
    SELECT id, user_id, provider, provider_id, identity_data, created_at, updated_at
    FROM auth.identities
    ORDER BY created_at ASC
  `)

  const client = await target.connect()
  try {
    await client.query('BEGIN')

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
        console.warn(`  Skipping unknown provider: ${identity.provider} for user ${identity.user_id}`)
        continue
      }

      await client.query(
        `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [accountId, identityAccountId, providerId, identity.user_id, password, identity.created_at, identity.updated_at],
      )
    }

    await client.query('COMMIT')
    console.log(`  Migrated ${identities.length} identities`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function migrateApplicationData() {
  console.log('Phase 3: Migrating application data...')

  const client = await target.connect()
  try {
    await client.query('BEGIN')

    // 1. tag_groups (no user FK)
    const { rows: tagGroups } = await source.query(`
      SELECT id, created_at, localized_name, color FROM tag_groups ORDER BY id ASC
    `)
    for (const row of tagGroups) {
      await client.query(
        `INSERT INTO tag_groups (id, created_at, localized_name, color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.created_at, JSON.stringify(row.localized_name), row.color],
      )
    }
    console.log(`  Migrated ${tagGroups.length} tag_groups`)

    // 2. profiles (PK = user.id)
    const { rows: profiles } = await source.query(`
      SELECT id, created_at, display_name FROM profiles ORDER BY created_at ASC
    `)
    for (const row of profiles) {
      await client.query(
        `INSERT INTO profiles (id, created_at, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.created_at, row.display_name],
      )
    }
    console.log(`  Migrated ${profiles.length} profiles`)

    // 3. tags (FK: created_by → user, group_id → tag_groups)
    const { rows: tags } = await source.query(`
      SELECT id, created_at, created_by, localized_name, localized_description, group_id
      FROM tags WHERE created_by IS NOT NULL ORDER BY id ASC
    `)
    for (const row of tags) {
      await client.query(
        `INSERT INTO tags (id, created_at, created_by, localized_name, localized_description, group_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.created_at, row.created_by, row.localized_name, row.localized_description, row.group_id],
      )
    }
    console.log(`  Migrated ${tags.length} tags`)

    // 4. tag_songs (FK: tag_id → tags, created_by → user)
    const { rows: tagSongs } = await source.query(`
      SELECT id, created_at, tag_id, song_id, sheet_type, sheet_difficulty, created_by
      FROM tag_songs WHERE created_by IS NOT NULL ORDER BY id ASC
    `)
    for (const row of tagSongs) {
      await client.query(
        `INSERT INTO tag_songs (id, created_at, tag_id, song_id, sheet_type, sheet_difficulty, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.created_at, row.tag_id, row.song_id, row.sheet_type, row.sheet_difficulty, row.created_by],
      )
    }
    console.log(`  Migrated ${tagSongs.length} tag_songs`)

    // 5. comments (self-ref parent_id — insert ORDER BY id ASC)
    const { rows: comments } = await source.query(`
      SELECT id, created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content
      FROM comments WHERE created_by IS NOT NULL ORDER BY id ASC
    `)
    for (const row of comments) {
      await client.query(
        `INSERT INTO comments (id, created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.created_at, row.created_by, row.song_id, row.sheet_type, row.sheet_difficulty, row.parent_id, row.content],
      )
    }
    console.log(`  Migrated ${comments.length} comments`)

    // 6. song_aliases (created_by nullable)
    const { rows: songAliases } = await source.query(`
      SELECT id, created_at, song_id, name, created_by FROM song_aliases ORDER BY id ASC
    `)
    for (const row of songAliases) {
      await client.query(
        `INSERT INTO song_aliases (id, created_at, song_id, name, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.created_at, row.song_id, row.name, row.created_by],
      )
    }
    console.log(`  Migrated ${songAliases.length} song_aliases`)

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function resetSequences() {
  console.log('Phase 4: Resetting sequences...')

  const sequences = [
    { seq: 'tag_groups_id_seq', table: 'tag_groups' },
    { seq: 'tags_id_seq', table: 'tags' },
    { seq: 'tag_songs_id_seq', table: 'tag_songs' },
    { seq: 'comments_id_seq', table: 'comments' },
    { seq: 'song_aliases_id_seq', table: 'song_aliases' },
  ]

  const client = await target.connect()
  try {
    for (const { seq, table } of sequences) {
      await client.query(`SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${table}), 1))`)
    }
    console.log('  Sequences reset')
  } finally {
    client.release()
  }
}

async function main() {
  console.log('Starting migration from Supabase to Better Auth...\n')

  try {
    const users = await migrateUsers()
    await migrateIdentities(users)
    await migrateApplicationData()
    await resetSequences()

    console.log('\nMigration completed successfully!')
  } catch (err) {
    console.error('\nMigration failed:', err)
    process.exit(1)
  } finally {
    await source.end()
    await target.end()
  }
}

main()
