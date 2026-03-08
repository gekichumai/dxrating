import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'
import * as authSchema from './auth-schema.js'
import { config } from '../config.js'

export const pool = new Pool({
  connectionString: config.databaseUrl,
})

export const db = drizzle(pool, {
  schema: {
    ...schema,
    ...authSchema,
  },
})
