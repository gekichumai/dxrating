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

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://dxrating.net",
  "https://dxrating.imgg.dev",
  "capacitor://localhost",
];

serve(async (_req) => {
  // cors
  const corsHeaders = {
    "Access-Control-Allow-Origin": _req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers":
      "Authorization, Apikey, Content-Type, X-Client-Info",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
  if (!_req.headers.has("Origin")) {
    return new Response(null, { status: 400 });
  }
  if (!ALLOWED_ORIGINS.includes(_req.headers.get("Origin")!)) {
    return new Response(
      JSON.stringify({
        error: "Origin is not allowed",
      }),
      { status: 403 }
    );
  }

  if (_req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    // Run a query
    const [tags, tagGroups, tagSongs] = await Promise.all([
      db
        .selectFrom("tags")
        .select(["id", "localized_name", "localized_description", "group_id"])
        .execute(),
      db
        .selectFrom("tag_groups")
        .select(["id", "localized_name", "color"])
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
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err.message },
      { status: 500, headers: corsHeaders }
    );
  } finally {
    // Close the pool
    await pool.end();
  }
});