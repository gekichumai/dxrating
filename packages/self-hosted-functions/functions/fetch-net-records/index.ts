import type Koa from 'koa'
import { MaimaiNETIntlClient, MaimaiNETJpClient, type StateUpdateCallback } from '../../lib/client'
import { Sentry, type Scope } from '../../lib/sentry'

export async function v0Handler(ctx: Koa.Context) {
  return await Sentry.startSpan({ name: 'fetchNetRecords_v0', op: 'function' }, async () => {
    const { region, authParams } = ctx.state

    Sentry.addBreadcrumb({
      message: 'Initializing MaimaiNET client',
      category: 'init',
      data: { region },
      level: 'info',
    })

    const client = {
      jp: new MaimaiNETJpClient(),
      intl: new MaimaiNETIntlClient(),
    }[region as 'jp' | 'intl']

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
      ctx.body = { recentRecords, musicRecords }
    } catch (error) {
      if (error instanceof Error) {
        Sentry.withScope((scope: Scope) => {
          scope.setContext('function', { name: 'fetchNetRecords_v0' })
          scope.setContext('parameters', { region: ctx.state.region })
          scope.setContext('endpoint', { name: 'MaimaiNET' })
          Sentry.captureException(error)
        })
      }
      throw error
    }
  })
}

export async function v1Handler(ctx: Koa.Context) {
  const { region, authParams } = ctx.state

  const onProgress: StateUpdateCallback = (state) => {
    Sentry.addBreadcrumb({
      message: `Progress update: ${state}`,
      category: 'progress',
      data: { state, region },
      level: 'info',
    })
    ctx.sse?.send({ event: 'progress', data: { state } })
  }

  Sentry.startSpan({ name: 'fetchNetRecords_v1', op: 'function' }, async () => {
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
      }[region as 'jp' | 'intl']

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

      ctx.sse?.send({ event: 'progress', data: { state: 'concluded' } })
      ctx.sse?.send({ event: 'data', data: { recent, music } })
      ctx.sse?.end()
    } catch (err) {
      if (err instanceof Error) {
        Sentry.withScope((scope: Scope) => {
          scope.setContext('function', { name: 'fetchNetRecords_v1' })
          scope.setContext('parameters', { region: ctx.state.region })
          scope.setContext('endpoint', { name: 'MaimaiNET (SSE)' })
          Sentry.captureException(err)
        })
      }

      ctx.sse?.send({
        event: 'error',
        data: {
          error: err instanceof Error ? err.message : 'internal server error',
        },
      })
      ctx.sse?.end()
    }
  })
}
