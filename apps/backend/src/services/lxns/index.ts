import * as crypto from 'node:crypto'
import { Clock, Data, Effect } from 'effect'
import { HttpBody } from 'effect/http'
import { eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { AppConfig } from '../../config'
import { Database } from '../../db/index'
import { HttpClient } from '../http-client'

const LXNS_BASE = 'https://maimai.lxns.net'
const LXNS_TOKEN_URL = `${LXNS_BASE}/api/v0/oauth/token`
const OAUTH_SCOPE = 'read_user_profile read_player'
const STATE_TTL_MS = 10 * 60 * 1000
const TOKEN_SAFETY_MARGIN_MS = 30 * 1000

export class LxnsError extends Data.TaggedError('LxnsError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

const configured = Effect.gen(function* () {
  const config = yield* AppConfig
  if (!config.lxns.clientId || !config.lxns.clientSecret) {
    return yield* Effect.fail(
      new LxnsError({
        message: 'LXNS OAuth is not configured (missing LXNS_CLIENT_ID or LXNS_CLIENT_SECRET)',
      }),
    )
  }
  return {
    clientId: config.lxns.clientId,
    clientSecret: config.lxns.clientSecret,
    redirectUri: `${config.auth.url.replace(/\/$/, '')}/api/v1/io/import/lxns/oauth_callback`,
  }
})

const decodeTokens = (json: unknown) =>
  Effect.try({
    try: () => LxnsTokenResponseSchema.parse(unwrapLxnsResponse(json)),
    catch: (cause) => new LxnsError({ message: 'Invalid LXNS token response', cause }),
  })

export const generateAuthorizationUrl = Effect.fn('Lxns.generateAuthorizationUrl')(function* (userId: string) {
  const config = yield* configured
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  yield* database.query('Delete expired LXNS states', (db) =>
    db.delete(lxnsOauthStates).where(lt(lxnsOauthStates.created_at, new Date(now - STATE_TTL_MS))),
  )
  const state = yield* Effect.sync(() => crypto.randomUUID())
  yield* database.query('Create LXNS OAuth state', (db) =>
    db.insert(lxnsOauthStates).values({ state, user_id: userId }),
  )
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: OAUTH_SCOPE,
    state,
  })
  return `${LXNS_BASE}/oauth/authorize?${params.toString()}`
})

// Once an upstream token is issued, finish persisting it even if the caller disconnects.
export const exchangeCodeForTokens = Effect.fn('Lxns.exchangeCodeForTokens')(function* (code: string, state: string) {
  const config = yield* configured
  const database = yield* Database
  const http = yield* HttpClient
  // Delete/return atomically: concurrent callbacks must not exchange the same state twice.
  const [stateRow] = yield* database.query('Consume LXNS OAuth state', (db) =>
    db.delete(lxnsOauthStates).where(eq(lxnsOauthStates.state, state)).returning(),
  )
  if (!stateRow) return yield* Effect.fail(new LxnsError({ message: 'Invalid or expired OAuth state' }))
  const timestamp = yield* Clock.currentTimeMillis
  if (timestamp - stateRow.created_at.getTime() > STATE_TTL_MS) {
    return yield* Effect.fail(new LxnsError({ message: 'OAuth state expired' }))
  }
  const tokenData = yield* Effect.gen(function* () {
    const response = yield* http.post(LXNS_TOKEN_URL, {
      headers: { 'Content-Type': 'application/json' },
      body: HttpBody.jsonUnsafe({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
      }),
    })
    if (response.status < 200 || response.status >= 300) {
      const text = yield* response.text
      return yield* Effect.fail(new LxnsError({ message: `LXNS token exchange failed: ${response.status} ${text}` }))
    }
    return yield* decodeTokens(yield* response.json)
  }).pipe(Effect.scoped, Effect.timeout('30 seconds'))
  const now = new Date(yield* Clock.currentTimeMillis)
  const values = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: new Date(now.getTime() + tokenData.expires_in * 1000),
    scope: tokenData.scope,
    updated_at: now,
  }
  yield* database.query('Save LXNS OAuth tokens', (db) =>
    db
      .insert(lxnsOauthTokens)
      .values({ user_id: stateRow.user_id, created_at: now, ...values })
      .onConflictDoUpdate({ target: lxnsOauthTokens.user_id, set: values }),
  )
  return stateRow.user_id
}, Effect.uninterruptible)

// Refresh tokens can rotate; cancellation must not lose the replacement credential.
const refreshAccessToken = Effect.fn('Lxns.refreshAccessToken')(function* (userId: string) {
  const config = yield* configured
  const database = yield* Database
  const http = yield* HttpClient
  const [token] = yield* database.query('Read LXNS refresh token', (db) =>
    db.select().from(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId)).limit(1),
  )
  if (!token) return yield* Effect.fail(new LxnsError({ message: 'No LXNS connection found. Please authorize first.' }))
  const tokenData = yield* Effect.gen(function* () {
    const response = yield* http.post(LXNS_TOKEN_URL, {
      headers: { 'Content-Type': 'application/json' },
      body: HttpBody.jsonUnsafe({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
      }),
    })
    if (response.status < 200 || response.status >= 300) {
      yield* disconnect(userId)
      return yield* Effect.fail(new LxnsError({ message: 'LXNS connection expired. Please reconnect your account.' }))
    }
    return yield* decodeTokens(yield* response.json)
  }).pipe(Effect.scoped, Effect.timeout('30 seconds'))
  const now = new Date(yield* Clock.currentTimeMillis)
  yield* database.query('Update LXNS tokens', (db) =>
    db
      .update(lxnsOauthTokens)
      .set({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(now.getTime() + tokenData.expires_in * 1000),
        scope: tokenData.scope,
        updated_at: now,
      })
      .where(eq(lxnsOauthTokens.user_id, userId)),
  )
  return tokenData.access_token
}, Effect.uninterruptible)

const getValidAccessToken = Effect.fn('Lxns.getValidAccessToken')(function* (userId: string) {
  const database = yield* Database
  const [token] = yield* database.query('Read LXNS access token', (db) =>
    db.select().from(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId)).limit(1),
  )
  if (!token) return yield* Effect.fail(new LxnsError({ message: 'No LXNS connection found. Please authorize first.' }))
  const now = yield* Clock.currentTimeMillis
  return token.expires_at.getTime() - TOKEN_SAFETY_MARGIN_MS < now
    ? yield* refreshAccessToken(userId)
    : token.access_token
})

export const fetchPlayerScores = Effect.fn('Lxns.fetchPlayerScores')(function* (userId: string) {
  const accessToken = yield* getValidAccessToken(userId)
  const http = yield* HttpClient
  return yield* Effect.gen(function* () {
    const response = yield* http.get(`${LXNS_BASE}/api/v0/user/maimai/player/scores`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.status < 200 || response.status >= 300) {
      const text = yield* response.text
      return yield* Effect.fail(new LxnsError({ message: `LXNS API error: ${response.status} ${text}` }))
    }
    const json = yield* response.json
    return yield* Effect.try({
      try: () => LxnsScoresResponseSchema.parse(unwrapLxnsResponse(json)),
      catch: (cause) =>
        new LxnsError({ message: cause instanceof Error ? cause.message : 'Invalid LXNS scores response', cause }),
    })
  }).pipe(Effect.scoped, Effect.timeout('30 seconds'))
})

export const getConnectionStatus = Effect.fn('Lxns.getConnectionStatus')(function* (userId: string) {
  const database = yield* Database
  const [token] = yield* database.query('Read LXNS connection', (db) =>
    db.select().from(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId)).limit(1),
  )
  return { connected: !!token }
})

export const disconnect = Effect.fn('Lxns.disconnect')(function* (userId: string) {
  const database = yield* Database
  yield* database.query('Delete LXNS connection', (db) =>
    db.delete(lxnsOauthTokens).where(eq(lxnsOauthTokens.user_id, userId)),
  )
})

import { lxnsOauthStates, lxnsOauthTokens } from '../../db/schema'

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