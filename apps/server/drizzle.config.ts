import 'dotenv/config';
import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { config } from 'src/config';

dotenv.config({
  path: '.env.local',
});

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/*.ts',
  casing: 'snake_case',
  out: './src/db',
  dbCredentials: {
    url: config.DATABASE_URL,
  },
  schemaFilter: ['public'],
  strict: true,
});
