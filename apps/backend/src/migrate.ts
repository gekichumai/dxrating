import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)
await migrate(db, { migrationsFolder: './drizzle' })
await pool.end()
console.log('Migrations applied successfully')