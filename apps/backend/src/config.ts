import * as path from 'node:path'
import * as dotenv from 'dotenv'
import { z } from 'zod'
import { parseSuperAdministratorAllowlist } from './admin/super-administrator-allowlist.js'
import { ExactWebOriginListSchema, ExactWebOriginSchema, isLoopbackHostname, uniqueOrigins } from './origin-policy.js'

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
const optionalExactWebOrigin = z.preprocess(emptyStringToUndefined, ExactWebOriginSchema.optional())
const optionalCookieDomain = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
    .optional(),
)

const envSchema = z
  .object({
    // === Core Application ===
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3000').transform(Number),

    // === Database ===
    DATABASE_URL: z.string().url(),

    // === Authentication (BetterAuth) ===
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: ExactWebOriginSchema.default('http://localhost:3000'),
    // Better Auth reads this variable itself. Reject it so every web origin
    // comes through the validated settings below instead of a second channel.
    BETTER_AUTH_TRUSTED_ORIGINS: z.undefined().optional(),
    SUPER_ADMIN_USER_IDS: z.string().optional(),
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

    // Exact browser origins used by CORS and authentication return URLs.
    FRONTEND_URL: ExactWebOriginSchema.default('http://localhost:5173'),
    PUBLIC_ADDITIONAL_TRUSTED_ORIGINS: ExactWebOriginListSchema.default([]),
    ADMIN_FRONTEND_URL: optionalExactWebOrigin,
    ADMIN_ADDITIONAL_TRUSTED_ORIGINS: ExactWebOriginListSchema.default([]),
    // Transitional deletion only. Set this to the previous parent cookie
    // domain for one maximum session lifetime during the host-only rollout.
    LEGACY_AUTH_COOKIE_DOMAIN: optionalCookieDomain,

    // PostHog (for analytics API queries)
    POSTHOG_PROJECT_ID: optionalString,
    POSTHOG_API_KEY: optionalString,
  })
  .superRefine((candidate, context) => {
    const validateAdditionalHttpOrigin = (origin: string | undefined, path: (string | number)[]) => {
      if (!origin) return
      const parsed = new URL(origin)
      if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
        context.addIssue({
          code: 'custom',
          path,
          message: 'additional HTTP browser origins must be explicit loopback origins',
        })
      }
    }
    for (const [index, origin] of candidate.PUBLIC_ADDITIONAL_TRUSTED_ORIGINS.entries()) {
      validateAdditionalHttpOrigin(origin, ['PUBLIC_ADDITIONAL_TRUSTED_ORIGINS', index])
    }
    validateAdditionalHttpOrigin(candidate.ADMIN_FRONTEND_URL, ['ADMIN_FRONTEND_URL'])
    for (const [index, origin] of candidate.ADMIN_ADDITIONAL_TRUSTED_ORIGINS.entries()) {
      validateAdditionalHttpOrigin(origin, ['ADMIN_ADDITIONAL_TRUSTED_ORIGINS', index])
    }

    if (candidate.NODE_ENV === 'production') {
      if (!candidate.ADMIN_FRONTEND_URL) {
        context.addIssue({
          code: 'custom',
          path: ['ADMIN_FRONTEND_URL'],
          message: 'ADMIN_FRONTEND_URL is required in production',
        })
      }

      for (const [path, origin] of [
        [['BETTER_AUTH_URL'], candidate.BETTER_AUTH_URL],
        [['FRONTEND_URL'], candidate.FRONTEND_URL],
        ...candidate.PUBLIC_ADDITIONAL_TRUSTED_ORIGINS.map(
          (origin, index) => [['PUBLIC_ADDITIONAL_TRUSTED_ORIGINS', index], origin] as const,
        ),
        [['ADMIN_FRONTEND_URL'], candidate.ADMIN_FRONTEND_URL],
        ...candidate.ADMIN_ADDITIONAL_TRUSTED_ORIGINS.map(
          (origin, index) => [['ADMIN_ADDITIONAL_TRUSTED_ORIGINS', index], origin] as const,
        ),
      ] as const) {
        if (origin && new URL(origin).protocol !== 'https:') {
          context.addIssue({ code: 'custom', path: [...path], message: 'production web origins must use HTTPS' })
        }
      }
    }

    if (candidate.LEGACY_AUTH_COOKIE_DOMAIN) {
      const authHostname = new URL(candidate.BETTER_AUTH_URL).hostname
      const frontendHostname = new URL(candidate.FRONTEND_URL).hostname
      if (
        candidate.LEGACY_AUTH_COOKIE_DOMAIN !== frontendHostname ||
        !authHostname.endsWith(`.${candidate.LEGACY_AUTH_COOKIE_DOMAIN}`)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['LEGACY_AUTH_COOKIE_DOMAIN'],
          message: 'must equal the frontend hostname and be a parent of the authentication host',
        })
      }
    }
  })

const env = envSchema.parse(process.env)
const superAdministrators = parseSuperAdministratorAllowlist(env.SUPER_ADMIN_USER_IDS)
const adminFrontendOrigin = env.ADMIN_FRONTEND_URL ?? 'http://localhost:5174'
const adminTrustedOrigins = uniqueOrigins([adminFrontendOrigin, ...env.ADMIN_ADDITIONAL_TRUSTED_ORIGINS])
const publicTrustedOrigins = uniqueOrigins([env.FRONTEND_URL, ...env.PUBLIC_ADDITIONAL_TRUSTED_ORIGINS])
const browserTrustedOrigins = uniqueOrigins([...publicTrustedOrigins, ...adminTrustedOrigins])

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  auth: {
    secret: env.BETTER_AUTH_SECRET,
    url: env.BETTER_AUTH_URL,
    superAdministrators,
    trustedOrigins: [...browserTrustedOrigins, 'dxrating://'],
    legacyCookieDomain: env.LEGACY_AUTH_COOKIE_DOMAIN,
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
  admin: {
    frontendOrigin: adminFrontendOrigin,
    trustedOrigins: adminTrustedOrigins,
  },
  public: {
    trustedOrigins: publicTrustedOrigins,
  },
  browserTrustedOrigins,
  lxns: {
    clientId: env.LXNS_CLIENT_ID,
    clientSecret: env.LXNS_CLIENT_SECRET,
  },
  frontendUrl: env.FRONTEND_URL,
  posthog: {
    projectId: env.POSTHOG_PROJECT_ID,
    apiKey: env.POSTHOG_API_KEY,
  },
} as const