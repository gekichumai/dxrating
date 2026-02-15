import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { type AuthParams, MaimaiNETIntlClient, MaimaiNETJpClient, type StateUpdateCallback } from '../lib/client'

const authParamsSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1),
  region: z.enum(['jp', 'intl']),
})

export async function fetchNetRecordsV0Handler(c: Context) {
  try {
    const body = await c.req.json()
    const result = authParamsSchema.safeParse(body)

    if (!result.success) {
      return c.json(
        {
          error: 'Invalid parameters',
          details: result.error.issues,
        },
        400,
      )
    }

    const { id, password, region } = result.data
    const authParams: AuthParams = { id, password }

    const client = region === 'jp' ? new MaimaiNETJpClient() : new MaimaiNETIntlClient()

    await client.login(authParams)
    const recentRecords = await client.fetchRecentRecords()
    const musicRecords = await client.fetchMusicRecords()

    return c.json({ recentRecords, musicRecords })
  } catch (error) {
    console.error('Error in fetchNetRecordsV0Handler:', error)

    if (error instanceof Error) {
      if (error.message.includes('invalid credentials')) {
        return c.json({ error: error.message }, 401)
      }
      if (error.message.includes('maintenance')) {
        return c.json({ error: error.message }, 503)
      }
    }

    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
}

export async function fetchNetRecordsV1Handler(c: Context) {
  const region = c.req.param('region')

  if (region !== 'jp' && region !== 'intl') {
    return c.json({ error: 'Invalid region. Must be "jp" or "intl".' }, 400)
  }

  try {
    const body = await c.req.json()
    const requestBodySchema = z.object({
      id: z.string().min(1),
      password: z.string().min(1),
    })

    const result = requestBodySchema.safeParse(body)

    if (!result.success) {
      return c.json(
        {
          error: 'Invalid parameters',
          details: result.error.issues,
        },
        400,
      )
    }

    const authParams: AuthParams = { id: result.data.id, password: result.data.password }

    return streamSSE(c, async (stream) => {
      const onProgress: StateUpdateCallback = (state) => {
        stream.writeSSE({ event: 'progress', data: JSON.stringify({ state }) })
      }

      try {
        const client = region === 'jp' ? new MaimaiNETJpClient(onProgress) : new MaimaiNETIntlClient(onProgress)

        await client.login(authParams)
        const recent = await client.fetchRecentRecords()
        const music = await client.fetchMusicRecords()

        await stream.writeSSE({ event: 'progress', data: JSON.stringify({ state: 'concluded' }) })
        await stream.writeSSE({ event: 'data', data: JSON.stringify({ recent, music }) })
      } catch (err) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            error: err instanceof Error ? err.message : 'internal server error',
          }),
        })
      }
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
}
