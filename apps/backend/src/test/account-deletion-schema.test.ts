import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, setupTestServer, signUp, teardownTestServer } from './setup'

const CLOUD_SAVE_TABLES = [
  'feature_flag_overrides',
  'score_saves',
  'score_import_jobs',
  'score_records',
  'score_record_events',
  'score_mutations',
  'score_save_snapshots',
]

// The API-level deletion test (account-deletion.test.ts) creates a save, mutations, a snapshot and a client
// import job through the API and the merge module and deletes the account; its stubbed LXNS import
// arrives with the server imports (design §14 PR 6).
describe('Account deletion database relationships', () => {
  beforeAll(async () => {
    await setupTestServer()
  })

  afterAll(async () => {
    await teardownTestServer()
  })

  beforeEach(async () => {
    await cleanDatabase()
  })

  it('deletes user content without deleting replies from other users', async () => {
    await signUp('delete@example.com', 'password123', 'Delete Me')
    await signUp('survivor@example.com', 'password123', 'Survivor')

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const users = await pool.query<{ id: string; email: string }>(
        `SELECT id, email FROM "user" WHERE email IN ('delete@example.com', 'survivor@example.com')`,
      )
      const deletedUserId = users.rows.find((user) => user.email === 'delete@example.com')!.id
      const survivorId = users.rows.find((user) => user.email === 'survivor@example.com')!.id

      const tagGroup = await pool.query<{ id: number }>(
        `INSERT INTO tag_groups (localized_name, color) VALUES ('{"en":"Test"}', '#000000') RETURNING id`,
      )
      const tag = await pool.query<{ id: number }>(
        `INSERT INTO tags (created_by, localized_name, localized_description, group_id)
         VALUES ($1, '{"en":"Delete"}', '{"en":"Delete"}', $2) RETURNING id`,
        [deletedUserId, tagGroup.rows[0]!.id],
      )
      await pool.query(
        `INSERT INTO tag_songs (tag_id, song_id, sheet_type, sheet_difficulty, created_by)
         VALUES ($1, 'song', 'dx', 'master', $2)`,
        [tag.rows[0]!.id, survivorId],
      )
      await pool.query(`INSERT INTO song_aliases (song_id, name, created_by) VALUES ('song', 'Deleted alias', $1)`, [
        deletedUserId,
      ])

      const parent = await pool.query<{ id: number }>(
        `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, content)
         VALUES ($1, 'song', 'dx', 'master', 'Deleted comment') RETURNING id`,
        [deletedUserId],
      )
      const reply = await pool.query<{ id: number }>(
        `INSERT INTO comments (created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
         VALUES ($1, 'song', 'dx', 'master', $2, 'Surviving reply') RETURNING id`,
        [survivorId, parent.rows[0]!.id],
      )

      await pool.query(`DELETE FROM "user" WHERE id = $1`, [deletedUserId])

      const [deletedUser, deletedTag, deletedTagSong, deletedAlias, deletedComment, survivingReply] = await Promise.all(
        [
          pool.query(`SELECT id FROM "user" WHERE id = $1`, [deletedUserId]),
          pool.query(`SELECT id FROM tags WHERE id = $1`, [tag.rows[0]!.id]),
          pool.query(`SELECT id FROM tag_songs WHERE tag_id = $1`, [tag.rows[0]!.id]),
          pool.query(`SELECT id FROM song_aliases WHERE created_by = $1`, [deletedUserId]),
          pool.query(`SELECT id FROM comments WHERE id = $1`, [parent.rows[0]!.id]),
          pool.query<{ parent_id: number | null }>(`SELECT parent_id FROM comments WHERE id = $1`, [reply.rows[0]!.id]),
        ],
      )

      expect(deletedUser.rowCount).toBe(0)
      expect(deletedTag.rowCount).toBe(0)
      expect(deletedTagSong.rowCount).toBe(0)
      expect(deletedAlias.rowCount).toBe(0)
      expect(deletedComment.rowCount).toBe(0)
      expect(survivingReply.rows).toEqual([{ parent_id: null }])
    } finally {
      await pool.end()
    }
  })

  it("deletes every cloud save row of the deleted user and keeps the survivor's", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const insert = (table: string, row: Record<string, unknown>) => {
      const columns = Object.keys(row)
      return pool.query(
        `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(', ')})
         VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
        Object.values(row),
      )
    }
    // Seeds the same rows for one user: an opt-in, a save, a server and a client job,
    // a verified, a manual and a tombstoned record, an event, a mutation and a snapshot.
    const seed = async (userId: string) => {
      const saveId = `dsav_${randomUUID()}`
      const serverJobId = `dimp_${randomUUID()}`
      const clientJobId = `dimp_${randomUUID()}`
      await insert('"user"', { id: userId, name: userId, email: `${userId}@example.invalid` })
      await insert('feature_flag_overrides', {
        flag: 'cloud_save',
        user_id: userId,
        enabled: true,
        source: 'opt_in',
        consent_version: '2026-11-01',
      })
      await insert('score_saves', { id: saveId, user_id: userId, name: 'JP', region: 'jp' })
      for (const [id, fetchedBy, source] of [
        [serverJobId, 'server', 'lxns'],
        [clientJobId, 'client', 'aqua-dx'],
      ]) {
        await insert('score_import_jobs', {
          id,
          user_id: userId,
          save_id: saveId,
          source,
          fetched_by: fetchedBy,
          trigger: 'user',
          idempotency_key: id,
          status: 'succeeded',
        })
      }
      const record = {
        save_id: saveId,
        user_id: userId,
        achievement: 1005000,
        fetched_by: 'client',
        verification: 'client_reported',
      }
      await insert('score_records', {
        ...record,
        sheet_id: 'dsht_23456789ab',
        source: 'lxns',
        fetched_by: 'server',
        verification: 'verified',
        entry_method: 'import',
        import_job_id: serverJobId,
        raw_payload_sha256: 'a'.repeat(64),
        fetched_at: new Date(),
        revision: 1,
      })
      await insert('score_records', {
        ...record,
        sheet_id: 'dsht_23456789ac',
        source: 'manual',
        entry_method: 'typed',
        revision: 2,
      })
      await insert('score_records', {
        ...record,
        sheet_id: 'dsht_23456789ad',
        source: 'aqua-dx',
        entry_method: 'file',
        import_job_id: clientJobId,
        revision: 3,
        deleted_at: new Date(),
      })
      await insert('score_record_events', {
        save_id: saveId,
        user_id: userId,
        sheet_id: 'dsht_23456789ab',
        kind: 'import_applied',
        source: 'lxns',
        fetched_by: 'server',
        verification: 'verified',
        import_job_id: serverJobId,
      })
      await insert('score_mutations', {
        user_id: userId,
        mutation_id: randomUUID(),
        save_id: saveId,
        result: JSON.stringify({ status: 'applied' }),
      })
      await insert('score_save_snapshots', {
        save_id: saveId,
        user_id: userId,
        at_revision: 3,
        b15_sum: 4000,
        b35_sum: 8000,
        b50_sum: 12000,
        record_count: 2,
        game_version: 'circle',
      })
    }
    const counts = async (userId: string) => {
      const result: Record<string, number> = {}
      for (const table of CLOUD_SAVE_TABLES) {
        const rows = await pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`,
          [userId],
        )
        result[table] = rows.rows[0]!.count
      }
      return result
    }

    try {
      const deletedUserId = `deleted-${randomUUID()}`
      const survivorId = `survivor-${randomUUID()}`
      await seed(deletedUserId)
      await seed(survivorId)
      const seeded = {
        feature_flag_overrides: 1,
        score_saves: 1,
        score_import_jobs: 2,
        score_records: 3,
        score_record_events: 1,
        score_mutations: 1,
        score_save_snapshots: 1,
      }
      expect(await counts(deletedUserId)).toEqual(seeded)

      // One statement cascades into both sides of the composite (import_job_id, fetched_by) foreign key.
      await expect(pool.query(`DELETE FROM "user" WHERE id = $1`, [deletedUserId])).resolves.toMatchObject({
        rowCount: 1,
      })

      expect(await counts(deletedUserId)).toEqual(Object.fromEntries(CLOUD_SAVE_TABLES.map((table) => [table, 0])))
      expect(await counts(survivorId)).toEqual(seeded)
    } finally {
      await pool.end()
    }
  })
})