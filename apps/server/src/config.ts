import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.number().default(3000),
  SUPABASE_URL: z.string(),
  SUPABASE_KEY: z.string(),
});

export const config = envSchema.parse(process.env);
