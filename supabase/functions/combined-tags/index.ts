import { serve } from 'https://deno.land/std@0.175.0/http/server.ts'
import { cors } from '../_helpers/cors.ts'
import { db } from '../_helpers/database/db.ts'
import { bigintEncoder } from '../_helpers/json.ts'

serve(async (_req) => {
  let corsHeaders: Record<string, string>
  try {
    corsHeaders = cors(_req)
  } catch (e) {
    return e
  }

  try {
    // Run a query
    const [tags, tagGroups, tagSongs] = await Promise.all([
      db.selectFrom('tags').select(['id', 'localized_name', 'localized_description', 'group_id']).execute(),
      db.selectFrom('tag_groups').select(['id', 'localized_name', 'color']).execute(),
      db.selectFrom('tag_songs').select(['song_id', 'sheet_type', 'sheet_difficulty', 'tag_id']).execute(),
    ])

    // Encode the result as pretty printed JSON
    const body = JSON.stringify(
      {
        tags,
        tagGroups,
        tagSongs,
      },
      bigintEncoder,
    )

    // Return the response with the correct content type header
    return new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600', // Cache for 1 hour
        ...corsHeaders,
      },
    })
  } catch (err) {
    console.error(err)
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders })
  }
})
