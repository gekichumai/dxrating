import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.number().default(3000),
  SUPABASE_URL: z.string(),
  SUPABASE_KEY: z.string(),
  SUPABASE_JWT_SECRET: z.string(),
  SUPABASE_JWT_ISSUER: z.string(),
});

export const config = envSchema.parse(process.env);
