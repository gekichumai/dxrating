import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { MaimaiNETIntlClient, MaimaiNETJpClient, type StateUpdateCallback } from '../../../lib/functions/client'
import { Sentry, type Scope } from '../../../lib/functions/sentry'

export async function v0Handler(c: Context) {
  return await Sentry.startSpan({ name: 'fetchNetRecords_v0', op: 'function' }, async () => {
    const region = c.get('region') as 'jp' | 'intl'
    const authParams = c.get('authParams')

    Sentry.addBreadcrumb({
      message: 'Initializing MaimaiNET client',
      category: 'init',
      data: { region },
      level: 'info',
    })

    const client = {
      jp: new MaimaiNETJpClient(),
      intl: new MaimaiNETIntlClient(),
    }[region]

    Sentry.addBreadcrumb({
      message: 'Attempting login to MaimaiNET',
      category: 'auth',
      data: { region },
      level: 'info',
    })
    await client.login(authParams)

    Sentry.addBreadcrumb({
      message: 'Fetching recent records',
      category: 'fetch',
      level: 'info',
    })
    const recentRecords = await client.fetchRecentRecords()

    Sentry.addBreadcrumb({
      message: 'Fetching music records',
      category: 'fetch',
      level: 'info',
    })
    const musicRecords = await client.fetchMusicRecords()

    Sentry.addBreadcrumb({
      message: 'Successfully fetched all records',
      category: 'success',
      data: {
        recentCount: recentRecords.length,
        musicCount: musicRecords.length,
      },
      level: 'info',
    })

    try {
      return c.json({ recentRecords, musicRecords })
    } catch (error) {
      if (error instanceof Error) {
        Sentry.withScope((scope: Scope) => {
          scope.setContext('function', { name: 'fetchNetRecords_v0' })
          scope.setContext('parameters', { region })
          scope.setContext('endpoint', { name: 'MaimaiNET' })
          Sentry.captureException(error)
        })
      }
      throw error
    }
  })
}

export async function v1Handler(c: Context) {
  const region = c.get('region') as 'jp' | 'intl'
  const authParams = c.get('authParams')

  return streamSSE(c, async (stream) => {
    const onProgress: StateUpdateCallback = async (state) => {
      Sentry.addBreadcrumb({
        message: `Progress update: ${state}`,
        category: 'progress',
        data: { state, region },
        level: 'info',
      })
      await stream.writeSSE({ event: 'progress', data: JSON.stringify({ state }) })
    }

    await Sentry.startSpan({ name: 'fetchNetRecords_v1', op: 'function' }, async () => {
      try {
        Sentry.addBreadcrumb({
          message: 'Starting SSE fetch NET records',
          category: 'init',
          data: { region },
          level: 'info',
        })

        const client = {
          jp: new MaimaiNETJpClient(onProgress),
          intl: new MaimaiNETIntlClient(onProgress),
        }[region]

        Sentry.addBreadcrumb({
          message: 'Attempting login to MaimaiNET (SSE)',
          category: 'auth',
          data: { region },
          level: 'info',
        })
        await client.login(authParams)

        Sentry.addBreadcrumb({
          message: 'Fetching recent records (SSE)',
          category: 'fetch',
          level: 'info',
        })
        const recent = await client.fetchRecentRecords()

        Sentry.addBreadcrumb({
          message: 'Fetching music records (SSE)',
          category: 'fetch',
          level: 'info',
        })
        const music = await client.fetchMusicRecords()

        Sentry.addBreadcrumb({
          message: 'Successfully completed SSE fetch',
          category: 'success',
          data: {
            recentCount: recent.length,
            musicCount: music.length,
          },
          level: 'info',
        })

        await stream.writeSSE({ event: 'progress', data: JSON.stringify({ state: 'concluded' }) })
        await stream.writeSSE({ event: 'data', data: JSON.stringify({ recent, music }) })
      } catch (err) {
        if (err instanceof Error) {
          Sentry.withScope((scope: Scope) => {
            scope.setContext('function', { name: 'fetchNetRecords_v1' })
            scope.setContext('parameters', { region })
            scope.setContext('endpoint', { name: 'MaimaiNET (SSE)' })
            Sentry.captureException(err)
          })
        }

        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            error: err instanceof Error ? err.message : 'internal server error',
          }),
        })
      }
    })
  })
}
