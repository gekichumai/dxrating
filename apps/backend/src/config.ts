import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()
dotenv.config({
  path: path.resolve(process.cwd(), '.env.local'),
  override: process.env.NODE_ENV !== 'test',
})
const vaultSecretPath = process.env.VAULT_SECRET_PATH
if (vaultSecretPath) {
  dotenv.config({
    path: path.resolve(vaultSecretPath),
    override: true,
  })
}

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value)
const optionalString = z.preprocess(emptyStringToUndefined, z.string().optional())
const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().url().optional())

const envSchema = z.object({
  // === Core Application ===
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),

  // === Database ===
  DATABASE_URL: z.string().url(),

  // === Authentication (BetterAuth) ===
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'), // Adjust default if needed
  PASSKEY_RP_ID: optionalString,
  PASSKEY_ORIGIN: optionalUrl,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,

  // Cloudflare Turnstile (CAPTCHA)
  TURNSTILE_SECRET_KEY: optionalString,

  // LXNS OAuth (maimai.lxns.net)
  LXNS_CLIENT_ID: optionalString,
  LXNS_CLIENT_SECRET: optionalString,

  // Frontend URL (used for OAuth redirects)
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // PostHog (for analytics API queries)
  POSTHOG_PROJECT_ID: optionalString,
  POSTHOG_API_KEY: optionalString,

  // Axiom (for evlog wide events)
  AXIOM_API_KEY: optionalString,
  AXIOM_DATASET: optionalString,
})

export const deriveCrossSubDomainCookieDomain = ({
  authURL,
  frontendURL,
}: {
  authURL: string
  frontendURL: string
}) => {
  const authHost = new URL(authURL).hostname
  const frontendHost = new URL(frontendURL).hostname

  if (authHost === frontendHost || !authHost.endsWith(`.${frontendHost}`)) {
    return undefined
  }

  return frontendHost
}

const env = envSchema.parse(process.env)

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  auth: {
    secret: env.BETTER_AUTH_SECRET,
    url: env.BETTER_AUTH_URL,
    cookieDomain: deriveCrossSubDomainCookieDomain({
      authURL: env.BETTER_AUTH_URL,
      frontendURL: env.FRONTEND_URL,
    }),
    passkey: {
      rpID: env.PASSKEY_RP_ID,
      origin: env.PASSKEY_ORIGIN,
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
    turnstile: {
      secretKey: env.TURNSTILE_SECRET_KEY,
    },
  },
  lxns: {
    clientId: env.LXNS_CLIENT_ID,
    clientSecret: env.LXNS_CLIENT_SECRET,
  },
  frontendUrl: env.FRONTEND_URL,
  posthog: {
    projectId: env.POSTHOG_PROJECT_ID,
    apiKey: env.POSTHOG_API_KEY,
  },
  axiom: {
    apiKey: env.AXIOM_API_KEY,
    dataset: env.AXIOM_DATASET,
  },
} as const