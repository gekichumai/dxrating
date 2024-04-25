import { serve } from "https://deno.land/std@0.175.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { db } from "../../database/db.ts";
import { cors } from "../../helpers/cors.ts";

serve(async (_req) => {
  let corsHeaders: Record<string, string>;
  try {
    corsHeaders = cors(_req);
  } catch (e) {
    return e;
  }

  try {
    const { songId, sheetType, sheetDifficulty, parentId, content } =
      await _req.json();

    if (
      songId == null ||
      sheetType == null ||
      sheetDifficulty == null ||
      content == null
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (parentId) {
      const res = db
        .selectFrom("comments")
        .select(["id"])
        .where("id", "=", parentId)
        .executeTakeFirst();
      if (!res) {
        return new Response(
          JSON.stringify({ error: "Parent comment not found" }),
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }
    }

    //

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: _req.headers.get("Authorization")! },
        },
      }
    );
    const { data } = await supabaseClient.auth.getUser();
    const user = data.user;
    const comment = await db
      .insertInto("comments")
      .values({
        created_at: new Date(),
        created_by: user.id,
        song_id: songId,
        sheet_type: sheetType,
        sheet_difficulty: sheetDifficulty,
        parent_id: parentId,
        content,
      })
      .returning(["id", "created_at"])
      .executeTakeFirst();

    return new Response(JSON.stringify(comment), {
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
