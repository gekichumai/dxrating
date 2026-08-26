import * as crypto from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import type { Pool } from 'pg'
import { z } from 'zod'
import { config } from '../../config.js'
import { db, pool } from '../../db/index.js'
import { lxnsOauthStates, lxnsOauthTokens } from '../../db/schema.js'
import { loadPostgresUserBanState } from '../../admin/user-ban-store.js'
import { PublicAccountBanned, runPostgresPublicUserWriteLeaseWithoutSession } from '../../public-access-policy.js'

const LXNS_BASE = 'https://maimai.lxns.net'
const LXNS_AUTHORIZE_URL = `${LXNS_BASE}/oauth/authorize`
const LXNS_TOKEN_URL = `${LXNS_BASE}/api/v0/oauth/token`
const LXNS_USER_SCORES_URL = `${LXNS_BASE}/api/v0/user/maimai/player/scores`

const OAUTH_SCOPE = 'read_user_profile read_player'
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const TOKEN_SAFETY_MARGIN_MS = 30 * 1000 // 30 seconds before actual expiry

function getRedirectUri() {
  // Use BETTER_AUTH_URL as the canonical backend URL (it's always the public-facing backend origin)
  const backendUrl = config.auth.url.replace(/\/$/, '')
  return `${backendUrl}/api/v1/io/import/lxns/oauth_callback`
}

function ensureConfigured() {
  if (!config.lxns.clientId || !config.lxns.clientSecret) {
    throw new Error('LXNS OAuth is not configured (missing LXNS_CLIENT_ID or LXNS_CLIENT_SECRET)')
  }
}

// --- OAuth Flow ---

export async function generateAuthorizationUrl(userId: string): Promise<string> {
  ensureConfigured()

  // Clean up expired states
  await db.delete(lxnsOauthStates).where(lt(lxnsOauthStates.created_at, new Date(Date.now() - STATE_TTL_MS)))

  const state = crypto.randomUUID()
  await db.insert(lxnsOauthStates).values({
    state,
    user_id: userId,
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.lxns.clientId!,
    redirect_uri: getRedirectUri(),
    scope: OAUTH_SCOPE,
    state,
  })

  return `${LXNS_AUTHORIZE_URL}?${params.toString()}`
}

export type LxnsCodeExchangeDependencies = {
  readonly database?: Pool
  readonly request?: typeof globalThis.fetch
  readonly clientId?: string
  readonly clientSecret?: string
  readonly redirectUri?: string
}

export async function exchangeCodeForTokens(
  code: string,
  state: string,
  dependencies: LxnsCodeExchangeDependencies = {},
): Promise<string> {
  const database = dependencies.database ?? pool
  const request = dependencies.request ?? globalThis.fetch
  const clientId = dependencies.clientId ?? config.lxns.clientId
  const clientSecret = dependencies.clientSecret ?? config.lxns.clientSecret
  const redirectUri = dependencies.redirectUri ?? getRedirectUri()
  if (!clientId || !clientSecret) {
    throw new Error('LXNS OAuth is not configured (missing LXNS_CLIENT_ID or LXNS_CLIENT_SECRET)')
  }

  // Resolve and consume the one-time server-side state before any external
  // request. The callback intentionally does not trust a browser session.
  const consumed = await database.query<{
    readonly user_id: string
    readonly created_at: Date
    readonly valid: boolean
  }>(
    `
      WITH consumed_state AS (
        DELETE FROM lxns_oauth_states
        WHERE state = $1
        RETURNING user_id, created_at
      )
      SELECT
        user_id,
        created_at,
        created_at > (
          clock_timestamp() - ($2::bigint * interval '1 millisecond')
        )::timestamp AS valid
      FROM consumed_state
    `,
    [state, STATE_TTL_MS],
  )
  const stateRow = consumed.rows[0]
  if (!stateRow) {
    throw new Error('Invalid or expired OAuth state')
  }
  if (!stateRow.valid) {
    throw new Error('OAuth state expired')
  }

  const userId = stateRow.user_id

  // Avoid sending credentials or authorization codes to LXNS when the
  // database-time projection already says this account is banned.
  const stateBeforeExchange = await loadPostgresUserBanState(database, userId)
  if (stateBeforeExchange.active) throw new PublicAccountBanned(stateBeforeExchange)

  // Exchange code for tokens
  const response = await request(LXNS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LXNS token exchange failed: ${response.status} ${text}`)
  }

  const tokenData = LxnsTokenResponseSchema.parse(unwrapLxnsResponse(await response.json()))

  const now = new Date()
  const expiresAt = new Date(now.getTime() + tokenData.expires_in * 1000)

  // The network call creates a race window. Re-lock and re-evaluate the user
  // after it returns, then commit the credential upsert in that same lease.
  await runPostgresPublicUserWriteLeaseWithoutSession(
    userId,
    async (transaction) => {
      await transaction.query(
        `
          INSERT INTO lxns_oauth_tokens (
            user_id,
            access_token,
            refresh_token,
            expires_at,
            scope,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $6)
          ON CONFLICT (user_id) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            scope = EXCLUDED.scope,
            updated_at = EXCLUDED.updated_at
        `,
        [userId, tokenData.access_token, tokenData.refresh_token, expiresAt, tokenData.scope, now],
      )
    },
    database,
  )

  return userId
}

async function refreshAccessToken(userId: string): Promise<string> {
  ensureConfigured()

  const [token] = await db.select().from(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId)).limit(1)

  if (!token) {
    throw new Error('No LXNS connection found. Please authorize first.')
  }

  const response = await fetch(LXNS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      client_id: config.lxns.clientId,
      client_secret: config.lxns.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  })

  if (!response.ok) {
    // If refresh fails, the user needs to re-authorize
    await db.delete(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId))
    throw new Error('LXNS connection expired. Please reconnect your account.')
  }

  const tokenData = LxnsTokenResponseSchema.parse(unwrapLxnsResponse(await response.json()))

  const now = new Date()
  const expiresAt = new Date(now.getTime() + tokenData.expires_in * 1000)

  await db
    .update(lxnsOauthTokens)
    .set({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      scope: tokenData.scope,
      updated_at: now,
    })
    .where(eq(lxnsOauthTokens.user_id, userId))

  return tokenData.access_token
}

async function getValidAccessToken(userId: string): Promise<string> {
  const [token] = await db.select().from(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId)).limit(1)

  if (!token) {
    throw new Error('No LXNS connection found. Please authorize first.')
  }

  if (token.expires_at.getTime() - TOKEN_SAFETY_MARGIN_MS < Date.now()) {
    return await refreshAccessToken(userId)
  }

  return token.access_token
}

// --- LXNS API ---

export async function fetchPlayerScores(userId: string) {
  const accessToken = await getValidAccessToken(userId)

  const response = await fetch(LXNS_USER_SCORES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LXNS API error: ${response.status} ${text}`)
  }

  const data = unwrapLxnsResponse(await response.json())
  return LxnsScoresResponseSchema.parse(data)
}

// --- Connection Status ---

export async function getConnectionStatus(userId: string): Promise<{ connected: boolean }> {
  const [token] = await db.select().from(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId)).limit(1)

  return { connected: !!token }
}

export async function disconnect(userId: string): Promise<void> {
  await db.delete(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId))
}

// --- LXNS Response Envelope ---

const LxnsEnvelopeSchema = z.object({
  success: z.boolean(),
  code: z.number(),
  message: z.string().optional(),
  data: z.unknown(),
})

function unwrapLxnsResponse(json: unknown): unknown {
  const envelope = LxnsEnvelopeSchema.parse(json)
  if (!envelope.success) {
    throw new Error(`LXNS API error (${envelope.code}): ${envelope.message || 'Unknown error'}`)
  }
  return envelope.data
}

// --- Zod Schemas ---

const LxnsTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
  scope: z.string(),
})

const FCTypeSchema = z.preprocess((v) => (v === '' ? null : v), z.enum(['app', 'ap', 'fcp', 'fc']).nullable())
const FSTypeSchema = z.preprocess((v) => (v === '' ? null : v), z.enum(['fsdp', 'fsd', 'fsp', 'fs', 'sync']).nullable())

const LxnsScoreSchema = z.object({
  id: z.number(),
  song_name: z.string(),
  level: z.string(),
  level_index: z.number().int().min(0).max(4),
  achievements: z.number(),
  fc: FCTypeSchema,
  fs: FSTypeSchema,
  type: z.enum(['standard', 'dx', 'utage']),
  dx_score: z.number().optional(),
})

export const LxnsScoresResponseSchema = z.array(LxnsScoreSchema)

export type LxnsScore = z.infer<typeof LxnsScoreSchema>