import * as crypto from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { config } from '../../config.js'
import { db } from '../../db/index.js'
import { lxnsOauthStates, lxnsOauthTokens } from '../../db/schema.js'

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

export async function exchangeCodeForTokens(code: string, state: string): Promise<string> {
  ensureConfigured()

  // Validate state
  const [stateRow] = await db.select().from(lxnsOauthStates).where(eq(lxnsOauthStates.state, state)).limit(1)

  if (!stateRow) {
    throw new Error('Invalid or expired OAuth state')
  }

  if (Date.now() - stateRow.created_at.getTime() > STATE_TTL_MS) {
    await db.delete(lxnsOauthStates).where(eq(lxnsOauthStates.id, stateRow.id))
    throw new Error('OAuth state expired')
  }

  const userId = stateRow.user_id

  // Delete used state
  await db.delete(lxnsOauthStates).where(eq(lxnsOauthStates.id, stateRow.id))

  // Exchange code for tokens
  const response = await fetch(LXNS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.lxns.clientId,
      client_secret: config.lxns.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LXNS token exchange failed: ${response.status} ${text}`)
  }

  const tokenData = LxnsTokenResponseSchema.parse(await response.json())

  const now = new Date()
  const expiresAt = new Date(now.getTime() + tokenData.expires_in * 1000)

  // Upsert token
  await db
    .insert(lxnsOauthTokens)
    .values({
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      scope: tokenData.scope,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: lxnsOauthTokens.user_id,
      set: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        scope: tokenData.scope,
        updated_at: now,
      },
    })

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

  const tokenData = LxnsTokenResponseSchema.parse(await response.json())

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

  const data = await response.json()
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