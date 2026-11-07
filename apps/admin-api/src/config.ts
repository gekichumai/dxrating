import { Context, Layer } from 'effect'
import { z } from 'zod'
import { AgentTokensSchema } from './agent-tokens'

// An empty value (`NAME=` in an env file) means unset
const blank = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)
const optionalString = z.preprocess(blank, z.string().optional())

const list = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
  )

export const envSchema = z
  .object({
    // Fails closed: an unset NODE_ENV is production, so the development identity is refused and Access is required
    NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
    PORT: z.coerce.number().int().default(3100),
    /** The admin host's own origin; a browser request from any other origin is refused */
    ADMIN_ORIGIN: z.string().url().default('http://localhost:5180'),
    /** Cloudflare Access team domain, e.g. `example.cloudflareaccess.com` */
    ADMIN_ACCESS_TEAM_DOMAIN: optionalString,
    /** The Access application's AUD tag */
    ADMIN_ACCESS_AUD: optionalString,
    /** Emails allowed in, repeating the Access policy inside the app. Empty means nobody. */
    ADMIN_HUMAN_EMAILS: list,
    /** Development only: treat every request as this Access identity. Refused outside development. */
    /** Agent tokens: a JSON list of hashed, scoped, expiring tokens (see agent-tokens.ts). Blank means none. */
    ADMIN_AGENT_TOKENS: AgentTokensSchema,
    /** Requests per minute per agent; destructive scopes get a fifth of it */
    ADMIN_AGENT_RATE_LIMIT: z.coerce.number().int().positive().default(60),
    ADMIN_DEV_ACCESS_EMAIL: z.preprocess(blank, z.string().email().optional()),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'development' && env.ADMIN_DEV_ACCESS_EMAIL) {
      ctx.addIssue({ code: 'custom', message: 'ADMIN_DEV_ACCESS_EMAIL is allowed in development only' })
    }
    if (env.NODE_ENV === 'production' && (!env.ADMIN_ACCESS_TEAM_DOMAIN || !env.ADMIN_ACCESS_AUD)) {
      ctx.addIssue({ code: 'custom', message: 'ADMIN_ACCESS_TEAM_DOMAIN and ADMIN_ACCESS_AUD are required' })
    }
  })

export type AdminApiConfig = z.infer<typeof envSchema>

export class AdminApiConfigService extends Context.Service<AdminApiConfigService, AdminApiConfig>()(
  'dxrating-admin/Config',
) {}

export const adminApiConfigLayer = (config: AdminApiConfig) => Layer.succeed(AdminApiConfigService, config)