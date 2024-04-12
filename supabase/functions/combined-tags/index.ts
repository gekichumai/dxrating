import { serve } from "https://deno.land/std@0.175.0/http/server.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import {
  Generated,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "https://esm.sh/kysely@0.23.4";
import { PostgresDriver } from "./DenoPostgresDriver.ts";

console.log(`Function "sheet-details" up and running!`);

// Keys of this interface are table names.
interface Database {
  tag_groups: {
    id: Generated<bigint>;
    created_at: Date;
    localized_name: Record<string, string>;
    color: string;
  };
  tags: {
    id: Generated<bigint>;
    created_at: Date;
    created_by: string;
    localized_name: Record<string, string>;
    localized_description: Record<string, string>;
    group_id: bigint;
  };
  tag_songs: {
    id: Generated<bigint>;
    created_at: Date;
    tag_id: Generated<bigint>;
    song_id: string;
    sheet_type: string;
    sheet_difficulty: string;
    created_by: string;
  };
}

// Create a database pool with one connection.
const pool = new Pool(Deno.env.get("SUPABASE_DB_URL")!, 1);

// You'd create one of these when you start your app.
const db = new Kysely<Database>({
  dialect: {
    createAdapter() {
      return new PostgresAdapter();
    },
    createDriver() {
      return new PostgresDriver({ pool });
    },
    createIntrospector(db: Kysely<unknown>) {
      return new PostgresIntrospector(db);
    },
    createQueryCompiler() {
      return new PostgresQueryCompiler();
    },
  },
});

serve(async (_req) => {
  // cors
  if (_req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    // Run a query
    const [tags, tagGroups, tagSongs] = await Promise.all([
      db
        .selectFrom("tags")
        .select([
          "tags.id",
          "tags.localized_name",
          "tags.localized_description",
        ])
        .execute(),
      db
        .selectFrom("tag_groups")
        .select([
          "tag_groups.id",
          "tag_groups.localized_name",
          "tag_groups.color",
        ])
        .execute(),
      db
        .selectFrom("tag_songs")
        .select(["song_id", "sheet_type", "sheet_difficulty", "tag_id"])
        .execute(),
    ]);

    // Encode the result as pretty printed JSON
    const body = JSON.stringify(
      {
        tags,
        tagGroups,
        tagSongs,
      },
      (_, value) =>
        typeof value === "bigint"
          ? value > Number.MAX_SAFE_INTEGER
            ? value.toString()
            : Number(value)
          : value
    );

    // Return the response with the correct content type header
    return new Response(body, {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err?.message ?? err), { status: 500 });
  } finally {
    // Close the pool
    await pool.end();
  }
});
