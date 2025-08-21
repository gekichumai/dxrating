import type Koa from 'koa'
import { z } from 'zod'
import { Sentry, type Scope } from '../../lib/sentry'

// Zod schemas for response validation
const FCTypeSchema = z.enum(['app', 'ap', 'fcp', 'fc']).nullable()
const FSTypeSchema = z.enum(['fsdp', 'fsd', 'fsp', 'fs', 'sync']).nullable()
const RateTypeSchema = z.enum(['sssp', 'sss', 'ssp', 'ss', 'sp', 's', 'aaa', 'aa', 'a', 'bbb', 'bb', 'b', 'c', 'd'])
const SongTypeSchema = z.enum(['standard', 'dx', 'utage'])
const LevelIndexSchema = z.number().int().min(0).max(4)

const LxnsPlayerResponseSchema = z.object({
  name: z.string(),
  rating: z.number().int(),
  friend_code: z.number().int(),
  course_rank: z.number().int(),
  class_rank: z.number().int(),
  star: z.number().int(),
})

const LxnsScoreResponseSchema = z
  .object({
    id: z.number().int(),
    song_name: z.string(),
    level: z.string(),
    level_index: LevelIndexSchema,
    fc: FCTypeSchema,
    fs: FSTypeSchema,
    rate: RateTypeSchema,
    type: SongTypeSchema,
  })
  .array()

type LxnsPlayerResponse = z.infer<typeof LxnsPlayerResponseSchema>
type LxnsScoreResponse = z.infer<typeof LxnsScoreResponseSchema>

// Zod schemas for parameter validation
const qqParamSchema = z.object({
  qq: z.string().min(1),
})

const friendCodeParamSchema = z.object({
  friendCode: z.string().min(1),
})

// API endpoints
const LXNS_API_BASE = 'https://maimai.lxns.net/api/v0/maimai'
const FETCH_TIMEOUT = 10_000 // 10 seconds timeout

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeout),
  })

  return response
}

/**
 * Fetch player data from LXNS API by QQ
 */
async function fetchPlayerDataByQQ(qq: string): Promise<LxnsPlayerResponse> {
  const response = await fetchWithTimeout(`${LXNS_API_BASE}/player/qq/${qq}`)

  if (!response.ok) {
    throw new Error(`Failed to fetch player data: ${response.status}`)
  }

  const data = await response.json()
  return LxnsPlayerResponseSchema.parse(data)
}

/**
 * Fetch player scores from LXNS API by friend code
 */
async function fetchPlayerScoresByFriendCode(friendCode: string): Promise<LxnsScoreResponse> {
  const response = await fetchWithTimeout(`${LXNS_API_BASE}/player/${friendCode}/scores`)

  if (!response.ok) {
    throw new Error(`Failed to fetch scores: ${response.status}`)
  }

  const data = await response.json()
  return LxnsScoreResponseSchema.parse(data)
}

export async function fetchPlayerByQQ(ctx: Koa.Context) {
  return await Sentry.startSpan({ name: 'fetchPlayerByQQ', op: 'function' }, async () => {
    Sentry.addBreadcrumb({
      message: 'Validating QQ parameter',
      category: 'validation',
      data: { qq: ctx.params.qq },
      level: 'info',
    })
    
    const result = qqParamSchema.safeParse({ qq: ctx.params.qq })

    if (!result.success) {
      ctx.status = 400
      ctx.body = { error: 'QQ parameter is required', details: result.error.errors }
      return
    }

    Sentry.addBreadcrumb({
      message: 'Fetching player data from LXNS API',
      category: 'api',
      data: { qq: result.data.qq },
      level: 'info',
    })
    const data = await fetchPlayerDataByQQ(result.data.qq)
    
    Sentry.addBreadcrumb({
      message: 'Successfully fetched player data',
      category: 'success',
      data: { playerId: data.friend_code },
      level: 'info',
    })
    try {
      ctx.body = data
    } catch (error) {
      console.error('Error fetching player data by QQ:', error)

      // Capture exception with context for non-validation errors
      if (error instanceof Error && !error.message.includes('QQ parameter is required')) {
        Sentry.withScope((scope: Scope) => {
          scope.setContext('function', { name: 'fetchPlayerByQQ' })
          scope.setContext('parameters', { qq: ctx.params.qq })
          scope.setContext('apiEndpoint', { name: 'LXNS player by QQ' })
          Sentry.captureException(error)
        })
      }

      if (error instanceof z.ZodError) {
        ctx.status = 500
        ctx.body = { error: 'Invalid response format from LXNS API', details: error.errors }
        return
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        ctx.status = 504
        ctx.body = { error: 'Request timeout' }
        return
      }

      ctx.status =
        error instanceof Error && error.message.includes('Failed to fetch')
          ? Number.parseInt(error.message.split(' ').pop() || '500')
          : 500
      ctx.body = { error: error instanceof Error ? error.message : 'Internal server error' }
    }
  })
}

export async function fetchScoresByFriendCode(ctx: Koa.Context) {
  return await Sentry.startSpan({ name: 'fetchScoresByFriendCode', op: 'function' }, async () => {
    Sentry.addBreadcrumb({
      message: 'Validating friend code parameter',
      category: 'validation',
      data: { friendCode: ctx.params.friendCode },
      level: 'info',
    })
    
    const result = friendCodeParamSchema.safeParse({ friendCode: ctx.params.friendCode })

    if (!result.success) {
      ctx.status = 400
      ctx.body = { error: 'Friend code parameter is required', details: result.error.errors }
      return
    }

    Sentry.addBreadcrumb({
      message: 'Fetching scores from LXNS API',
      category: 'api',
      data: { friendCode: result.data.friendCode },
      level: 'info',
    })
    const data = await fetchPlayerScoresByFriendCode(result.data.friendCode)
    
    Sentry.addBreadcrumb({
      message: 'Successfully fetched scores',
      category: 'success',
      data: { scoresCount: data.length },
      level: 'info',
    })
    try {
      ctx.body = data
    } catch (error) {
      console.error('Error fetching scores by friend code:', error)

      // Capture exception with context for non-validation errors
      if (error instanceof Error && !error.message.includes('Friend code parameter is required')) {
        Sentry.withScope((scope: Scope) => {
          scope.setContext('function', { name: 'fetchScoresByFriendCode' })
          scope.setContext('parameters', { friendCode: ctx.params.friendCode })
          scope.setContext('apiEndpoint', { name: 'LXNS scores by friend code' })
          Sentry.captureException(error)
        })
      }

      if (error instanceof z.ZodError) {
        ctx.status = 500
        ctx.body = { error: 'Invalid response format from LXNS API', details: error.errors }
        return
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        ctx.status = 504
        ctx.body = { error: 'Request timeout' }
        return
      }

      ctx.status =
        error instanceof Error && error.message.includes('Failed to fetch')
          ? Number.parseInt(error.message.split(' ').pop() || '500')
          : 500
      ctx.body = { error: error instanceof Error ? error.message : 'Internal server error' }
    }
  })
}
