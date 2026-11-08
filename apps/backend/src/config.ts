import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { z } from 'zod'
import { Context, Layer } from 'effect'

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
  APPLE_CLIENT_ID: optionalString,
  APPLE_TEAM_ID: optionalString,
  APPLE_KEY_ID: optionalString,
  APPLE_PRIVATE_KEY_B64: optionalString,
  APPLE_APP_BUNDLE_IDENTIFIER: z.string().default('net.dxrating.ios'),

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

  // === Feature flags (cloud save) ===
  // `off` is the kill switch and overrides every per-user override.
  CLOUD_SAVE_MODE: z.preprocess(emptyStringToUndefined, z.enum(['off', 'allowlist', 'optin', 'on']).default('off')),
  // Comma-separated, case-insensitive emails that get cloud save while the mode is not `off`.
  CLOUD_SAVE_ALLOWLIST_EMAILS: optionalString,
  // Server-side imports write into cloud saves; off until they are explicitly enabled.
  SERVER_IMPORTS: z.preprocess(emptyStringToUndefined, z.enum(['on', 'off']).default('off')),
  // Cloudflare edge cache purge (services/edge-cache.ts); both unset disables it
  CLOUDFLARE_ZONE_ID: optionalString,
  CLOUDFLARE_CACHE_PURGE_TOKEN: optionalString,
})

export const parseEmailAllowlist = (value: string | undefined): readonly string[] => [
  ...new Set(
    (value ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  ),
]

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
    apple: {
      clientId: env.APPLE_CLIENT_ID,
      teamId: env.APPLE_TEAM_ID,
      keyId: env.APPLE_KEY_ID,
      privateKeyBase64: env.APPLE_PRIVATE_KEY_B64,
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
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
  featureFlags: {
    cloudSaveMode: env.CLOUD_SAVE_MODE,
    cloudSaveAllowlistEmails: parseEmailAllowlist(env.CLOUD_SAVE_ALLOWLIST_EMAILS),
    serverImports: env.SERVER_IMPORTS === 'on',
  },
  edgeCache:
    env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_CACHE_PURGE_TOKEN
      ? { zoneId: env.CLOUDFLARE_ZONE_ID, token: env.CLOUDFLARE_CACHE_PURGE_TOKEN }
      : undefined,
} as const

export class AppConfig extends Context.Service<AppConfig, typeof config>()('dxrating/AppConfig') {}
export const AppConfigLive = Layer.succeed(AppConfig, config)