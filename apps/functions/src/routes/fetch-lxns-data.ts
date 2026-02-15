import type { Context } from 'hono'
import { z } from 'zod'

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

export async function fetchPlayerByQQ(c: Context) {
  const qq = c.req.param('qq')

  if (!qq || qq.trim() === '') {
    return c.json({ error: 'QQ parameter is required' }, 400)
  }

  try {
    const data = await fetchPlayerDataByQQ(qq)
    return c.json(data)
  } catch (error) {
    console.error('Error fetching player data by QQ:', error)

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid response format from LXNS API', details: error.issues }, 500)
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return c.json({ error: 'Request timeout' }, 504)
    }

    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      const statusMatch = error.message.match(/: (\d+)$/)
      const status = statusMatch ? Number.parseInt(statusMatch[1]) : 500
      return c.json({ error: error.message }, status as 400 | 401 | 404 | 500)
    }

    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
}

export async function fetchScoresByFriendCode(c: Context) {
  const friendCode = c.req.param('friendCode')

  if (!friendCode || friendCode.trim() === '') {
    return c.json({ error: 'Friend code parameter is required' }, 400)
  }

  try {
    const data = await fetchPlayerScoresByFriendCode(friendCode)
    return c.json(data)
  } catch (error) {
    console.error('Error fetching scores by friend code:', error)

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid response format from LXNS API', details: error.issues }, 500)
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return c.json({ error: 'Request timeout' }, 504)
    }

    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      const statusMatch = error.message.match(/: (\d+)$/)
      const status = statusMatch ? Number.parseInt(statusMatch[1]) : 500
      return c.json({ error: error.message }, status as 400 | 401 | 404 | 500)
    }

    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
}
