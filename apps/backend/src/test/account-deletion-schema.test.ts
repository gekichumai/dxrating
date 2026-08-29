import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, setupTestServer, signUp, teardownTestServer } from './setup.js'

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
})