import { pool } from './db/index.js'

// Operator-only CLI: database access is required; there is no public moderation endpoint.
const [action, rawId] = process.argv.slice(2)
try {
  if (action === 'list') {
    const result = await pool.query(`SELECT r.id, r.action, r.created_at, c.id AS comment_id, c.content, c.created_by
      FROM comment_reports r JOIN comments c ON c.id = r.comment_id
      WHERE r.resolved_at IS NULL ORDER BY r.created_at LIMIT 100`)
    console.log(JSON.stringify(result.rows, null, 2))
  } else if ((action === 'remove' || action === 'dismiss') && /^\d+$/.test(rawId ?? '')) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('SELECT comment_id FROM comment_reports WHERE id = $1 FOR UPDATE', [rawId])
      if (!rows.length) throw new Error('Report not found')
      if (action === 'remove') {
        await client.query('UPDATE comments SET removed_at = now() WHERE id = $1', [rows[0].comment_id])
        await client.query('UPDATE comment_reports SET resolved_at = now() WHERE comment_id = $1', [rows[0].comment_id])
      } else {
        await client.query('UPDATE comment_reports SET resolved_at = now() WHERE id = $1', [rawId])
      }
      await client.query('COMMIT')
      console.log('Report resolved. Viewer hide/block preferences remain in effect.')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } else {
    throw new Error('Usage: pnpm exec tsx src/moderate-comments.ts list|remove <report-id>|dismiss <report-id>')
  }
} finally {
  await pool.end()
}