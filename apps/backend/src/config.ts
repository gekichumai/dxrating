import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()
dotenv.config({
  path: path.resolve(process.cwd(), '.env.local'),
  override: true,
})
const vaultSecretPath = process.env.VAULT_SECRET_PATH
if (vaultSecretPath) {
  dotenv.config({
    path: path.resolve(vaultSecretPath),
    override: true,
  })
}

const envSchema = z.object({
  // === Core Application ===
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),

  // === Database ===
  DATABASE_URL: z.string().url(),

  // === Authentication (BetterAuth) ===
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'), // Adjust default if needed
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
})

const env = envSchema.parse(process.env)

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  auth: {
    secret: env.BETTER_AUTH_SECRET,
    url: env.BETTER_AUTH_URL,
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
} as const
