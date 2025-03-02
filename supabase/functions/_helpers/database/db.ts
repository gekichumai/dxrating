import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts'
import {
  type Generated,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'https://esm.sh/kysely@0.23.4'
import { PostgresDriver } from './DenoPostgresDriver.ts'

// Keys of this interface are table names.
interface Database {
  tag_groups: {
    id: Generated<bigint>
    created_at: Date
    localized_name: Record<string, string>
    color: string
  }
  tags: {
    id: Generated<bigint>
    created_at: Date
    created_by: string
    localized_name: Record<string, string>
    localized_description: Record<string, string>
    group_id: bigint
  }
  tag_songs: {
    id: Generated<bigint>
    created_at: Date
    tag_id: Generated<bigint>
    song_id: string
    sheet_type: string
    sheet_difficulty: string
    created_by: string
  }
  profiles: {
    id: Generated<bigint>
    created_at: Date
    display_name: string
  }
  comments: {
    id: Generated<bigint>
    created_at: Date
    created_by: string
    song_id: string
    sheet_type: string
    sheet_difficulty: string
    parent_id: bigint | null
    content: string
  }
}

// Create a database pool with one connection.
const pool = new Pool(Deno.env.get('SUPABASE_DB_URL')!, 1, true)

// You'd create one of these when you start your app.
export const db = new Kysely<Database>({
  dialect: {
    createAdapter() {
      return new PostgresAdapter()
    },
    createDriver() {
      return new PostgresDriver({ pool })
    },
    createIntrospector(db: Kysely<unknown>) {
      return new PostgresIntrospector(db)
    },
    createQueryCompiler() {
      return new PostgresQueryCompiler()
    },
  },
})
