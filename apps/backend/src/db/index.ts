import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import * as authSchema from './auth-schema'
import { config } from '../config'

const pool = new Pool({
  connectionString: config.databaseUrl,
})

export const db = drizzle(pool, {
  schema: {
    ...schema,
    ...authSchema,
  },
})
