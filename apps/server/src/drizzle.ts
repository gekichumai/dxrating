import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from 'src/config';

const db = drizzle(config.DATABASE_URL);

export default db;
