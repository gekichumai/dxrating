import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * Agent tokens (gekichumai/meta#50 R2.5, L5). No schema: the env var ADMIN_AGENT_TOKENS holds a JSON list of
 * `{ principal, sha256, scopes, expiresAt, accessCommonName? }`. Only hashes are stored. A token is revoked by removing
 * its entry and redeploying; an expired one stops working on its own.
 */

/** Every scope an agent can hold. Read scopes are the default; write and destructive scopes are explicit. */
export const AGENT_SCOPES = [
  'announcements:read',
  'announcements:write',
  'comments:read',
  'comments:moderate',
  'users:read',
  'bans:write',
  'reports:read',
  'reports:triage',
  'catalog:read',
] as const
export type AgentScope = (typeof AGENT_SCOPES)[number]

/** Scopes that change or remove things other people see; they get a lower rate limit */
export const DESTRUCTIVE_SCOPES: readonly AgentScope[] = ['comments:moderate', 'bans:write']

export const TOKEN_PREFIX = 'dxa_'

/** An agent's name: lowercase letters, digits and hyphens, 2–48 characters, starting with a letter or digit */
export const AGENT_PRINCIPAL_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/

const AgentTokenEntrySchema = z
  .object({
    /** The agent's name; its actor is `agent:<principal>` */
    principal: z.string().regex(AGENT_PRINCIPAL_PATTERN),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    scopes: z.array(z.enum(AGENT_SCOPES)).min(1),
    expiresAt: z.iso.datetime({ offset: true }),
    /** When set, the token only works behind the Access service token with this common name */
    accessCommonName: z.string().min(1).optional(),
  })
  .strict()

export type AgentTokenEntry = z.infer<typeof AgentTokenEntrySchema>

/** Parses ADMIN_AGENT_TOKENS. Blank means no agent tokens. Malformed config fails startup rather than letting anyone in. */
export const AgentTokensSchema = z.preprocess(
  (value) => (typeof value === 'string' ? (value.trim() === '' ? [] : JSON.parse(value)) : (value ?? [])),
  z.array(AgentTokenEntrySchema).superRefine((entries, ctx) => {
    const seen = new Set<string>()
    for (const entry of entries) {
      if (seen.has(entry.sha256))
        ctx.addIssue({ code: 'custom', message: `Duplicate token hash for ${entry.principal}` })
      seen.add(entry.sha256)
    }
  }),
)

export const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')

/** Finds the entry whose hash matches `token`, comparing in constant time */
export const findAgentToken = (entries: readonly AgentTokenEntry[], token: string): AgentTokenEntry | undefined => {
  if (!token.startsWith(TOKEN_PREFIX)) return undefined
  const digest = Buffer.from(hashToken(token), 'hex')
  let match: AgentTokenEntry | undefined
  for (const entry of entries) {
    if (timingSafeEqual(digest, Buffer.from(entry.sha256, 'hex'))) match = entry
  }
  return match
}

/** A new token: 32 random bytes, prefixed so it is easy to recognise in a leak scan */
export const generateAgentToken = () => {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return { token, sha256: hashToken(token) }
}