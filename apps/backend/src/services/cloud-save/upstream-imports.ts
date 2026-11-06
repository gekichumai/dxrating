import { createHash } from 'node:crypto'
import {
  normalizeDivingFishRows,
  normalizeLxnsScores,
  normalizeMaimaiNetRecords,
  type DivingFishRow,
} from '@gekichumai/maimai-domain'
import { Cause, Effect } from 'effect'
import { HttpBody } from 'effect/http'
import { z } from 'zod'
import {
  NetImportError,
  NetRequestError,
  withMaimaiNETClient,
  type AuthParams,
  type StateUpdateCallback,
} from '../../lib/functions/client'
import { HttpClient } from '../http-client'
import { fetchPlayerWithScores, LxnsError } from '../lxns/index'
import { ServerImportFailure, type ServerImportErrorCode, type UpstreamFetch } from './server-imports'

// --- maimai NET ---

const NET_ERROR_CODES: Record<string, ServerImportErrorCode> = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  NET_MAINTENANCE: 'net_maintenance',
  AIME_CARD_UNAVAILABLE: 'aime_card_unavailable',
  TOKEN_ERROR: 'token_error',
  UNKNOWN_ERROR: 'upstream_error',
  INTERNAL_ERROR: 'upstream_error',
}

/**
 * The source account of a NET import when the friend code page cannot be read: `sha256('<region>:<SEGA ID>')`
 * (kind `segaid_hash`). The SEGA ID itself is never stored (design §6.2, §7.2).
 */
export const segaIdHash = (region: 'jp' | 'intl', segaId: string) =>
  createHash('sha256').update(`${region}:${segaId}`).digest('hex')

/**
 * Fetches a maimai NET import (design §6.2, §7.1): logs in, reads the friend code page, then every difficulty page of
 * the music records. Pages are strict (anything but a 200 fails) and retried by the #368 retry; one that still
 * fails fails the whole fetch, so the job writes nothing. Recent plays are not fetched: no record comes from them.
 * The SEGA ID and password are used for the login of this fetch only.
 */
export const fetchNetImport = (region: 'jp' | 'intl', auth: AuthParams, onProgress?: StateUpdateCallback) =>
  withMaimaiNETClient(
    region,
    (client) =>
      Effect.gen(function* () {
        yield* client.loginEffect(auth)
        const friendCode = yield* client.fetchFriendCodeEffect()
        const music = yield* client.fetchMusicRecordsEffect()
        return { music, friendCode }
      }),
    onProgress,
    { strictPages: true },
  ).pipe(
    Effect.mapError((error) =>
      error instanceof NetImportError
        ? new ServerImportFailure({ code: NET_ERROR_CODES[error.code] ?? 'upstream_error' })
        : error instanceof NetRequestError
          ? new ServerImportFailure({ code: 'upstream_error' })
          : new ServerImportFailure({ code: 'internal_error' }),
    ),
    Effect.map(
      ({ music, friendCode }): UpstreamFetch => ({
        payload: music,
        normalize: (catalog) => normalizeMaimaiNetRecords(catalog, music),
        sourceAccountId: friendCode ?? segaIdHash(region, auth.id),
        sourceAccountKind: friendCode ? 'friend_code' : 'segaid_hash',
      }),
    ),
  )

// --- LXNS ---

const lxnsFailure = (error: unknown) => {
  if (error instanceof LxnsError) {
    return new ServerImportFailure({ code: error.reason ?? 'upstream_error' })
  }
  if (Cause.isTimeoutError(error)) return new ServerImportFailure({ code: 'timeout' })
  return new ServerImportFailure({ code: 'upstream_error' })
}

/**
 * Fetches an LXNS import with the user's stored OAuth connection (refreshed as the LXNS service does): the player,
 * whose friend code is the source account, then every score, both with one access token.
 */
export const fetchLxnsImport = (userId: string) =>
  Effect.gen(function* () {
    const { player, scores } = yield* fetchPlayerWithScores(userId)
    return {
      payload: scores,
      normalize: (catalog) =>
        normalizeLxnsScores(
          catalog,
          scores.map((score) => ({
            id: score.id,
            songName: score.song_name,
            level: score.level,
            levelIndex: score.level_index,
            achievements: score.achievements,
            fc: score.fc,
            fs: score.fs,
            type: score.type,
            dxScore: score.dx_score,
          })),
        ),
      sourceAccountId: player.friend_code,
      sourceAccountKind: 'lxns_friend_code',
    } satisfies UpstreamFetch
  }).pipe(Effect.mapError(lxnsFailure))

// --- Diving-Fish ---

/** The public B50 query the Web and iOS clients use */
export const DIVING_FISH_B50_URL = 'https://www.diving-fish.com/api/maimaidxprober/query/player'

const DivingFishChartSchema = z.object({
  achievements: z.number(),
  fc: z.string().nullish(),
  fs: z.string().nullish(),
  level_index: z.number().int(),
  title: z.string(),
  type: z.string(),
  song_id: z.number().int(),
  dxScore: z.number().optional(),
})

const DivingFishB50Schema = z.object({
  charts: z.object({ dx: z.array(z.unknown()), sd: z.array(z.unknown()) }),
})

export type DivingFishQuery = { username: string } | { qq: string }

/**
 * Fetches the public Diving-Fish B50 of a username or QQ number (design §6.2): `charts.dx` is the B15, `charts.sd`
 * the B35, and each record keeps its bucket. 400 is an unknown player, 403 one who does not share their data.
 */
export const fetchDivingFishImport = (query: DivingFishQuery) =>
  Effect.gen(function* () {
    const http = yield* HttpClient
    const json = yield* Effect.gen(function* () {
      const response = yield* http.post(DIVING_FISH_B50_URL, {
        headers: { 'Content-Type': 'application/json' },
        body: HttpBody.jsonUnsafe({ b50: 1, ...query }),
      })
      if (response.status === 400) return yield* new ServerImportFailure({ code: 'not_found' })
      if (response.status === 403) return yield* new ServerImportFailure({ code: 'forbidden' })
      if (response.status < 200 || response.status >= 300) {
        return yield* new ServerImportFailure({ code: 'upstream_error' })
      }
      return yield* response.json
    }).pipe(Effect.scoped, Effect.timeout('30 seconds'))
    const parsed = DivingFishB50Schema.safeParse(json)
    if (!parsed.success) return yield* new ServerImportFailure({ code: 'invalid_response' })
    const rows: DivingFishRow[] = []
    let invalid = 0
    let masked = 0
    for (const [bucket, charts] of [
      ['b15', parsed.data.charts.dx],
      ['b35', parsed.data.charts.sd],
    ] as const) {
      for (const chart of charts) {
        const row = DivingFishChartSchema.safeParse(chart)
        if (!row.success) {
          invalid += 1
          continue
        }
        // The public B50 applies the player's score mask (an AP at 100.6% comes back as 101%, anything under 10% as 0%)
        // and says nothing about it, but a masked row has no DX score. A real play has one (short of nothing but Goods
        // or Misses), so such a row is left out as rejected rather than stored as an exact verified score that
        // keep-best merging would never lower again
        if (!row.data.dxScore) {
          masked += 1
          continue
        }
        rows.push({ ...row.data, fc: row.data.fc || null, fs: row.data.fs || null, bucket })
      }
    }
    if (invalid > 0 && rows.length === 0 && masked === 0) {
      return yield* new ServerImportFailure({ code: 'invalid_response' })
    }
    return {
      payload: parsed.data.charts,
      normalize: (catalog) => {
        const result = normalizeDivingFishRows(catalog, rows)
        // a malformed row counts as rejected, like an invalid achievement
        const malformed = Array.from({ length: invalid }, () => ({
          provider: 'diving-fish' as const,
          code: 'invalid-achievement' as const,
          message: 'Malformed Diving-Fish row',
          row: null,
        }))
        const hidden = Array.from({ length: masked }, () => ({
          provider: 'diving-fish' as const,
          code: 'invalid-achievement' as const,
          message: 'Diving-Fish row without a DX score (score mask): the achievement may be rounded',
          row: null,
        }))
        return { entries: result.entries, warnings: [...result.warnings, ...malformed, ...hidden] }
      },
      sourceAccountId: 'username' in query ? query.username : query.qq,
      sourceAccountKind: 'username' in query ? 'df_username' : 'df_qq',
    } satisfies UpstreamFetch
  }).pipe(Effect.mapError((error) => (error instanceof ServerImportFailure ? error : lxnsFailure(error))))