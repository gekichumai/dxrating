import { serve } from "https://deno.land/std@0.175.0/http/server.ts";
import { cors } from "../_helpers/cors.ts";
import { db } from "../_helpers/database/db.ts";
import { bigintEncoder } from "../_helpers/json.ts";

serve(async (_req) => {
  let corsHeaders: Record<string, string>;
  try {
    corsHeaders = cors(_req);
  } catch (e) {
    return e;
  }

  try {
    const { songId, sheetType, sheetDifficulty } = await _req.json();

    if (songId == null || sheetType == null || sheetDifficulty == null) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    //

    const comments = await db
      .selectFrom("comments")
      .leftJoin("profiles", "profiles.id", "comments.created_by")
      .select([
        "id",
        "parent_id",
        "created_at",
        "content",
        "profiles.display_name",
      ])
      .where("song_id", "=", songId)
      .where("sheet_type", "=", sheetType)
      .where("sheet_difficulty", "=", sheetDifficulty)
      .orderBy("created_at", "desc")
      .execute();

    return new Response(JSON.stringify(comments, bigintEncoder), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
