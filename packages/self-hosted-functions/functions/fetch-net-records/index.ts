import type Koa from 'koa'
import { MaimaiNETIntlClient, MaimaiNETJpClient, type StateUpdateCallback } from '../../lib/client'

export async function v0Handler(ctx: Koa.Context) {
  const { region, authParams } = ctx.state

  const client = {
    jp: new MaimaiNETJpClient(),
    intl: new MaimaiNETIntlClient(),
  }[region as 'jp' | 'intl']

  await client.login(authParams)

  const recentRecords = await client.fetchRecentRecords()
  const musicRecords = await client.fetchMusicRecords()

  ctx.body = { recentRecords, musicRecords }
}

export async function v1Handler(ctx: Koa.Context) {
  const { region, authParams } = ctx.state

  const onProgress: StateUpdateCallback = (state) => {
    ctx.sse?.send({ event: 'progress', data: { state } })
  }

  ;(async () => {
    try {
      const client = {
        jp: new MaimaiNETJpClient(onProgress),
        intl: new MaimaiNETIntlClient(onProgress),
      }[region as 'jp' | 'intl']

      await client.login(authParams)

      const recent = await client.fetchRecentRecords()
      const music = await client.fetchMusicRecords()

      ctx.sse?.send({ event: 'progress', data: { state: 'concluded' } })
      ctx.sse?.send({ event: 'data', data: { recent, music } })
      ctx.sse?.end()
    } catch (err) {
      ctx.sse?.send({
        event: 'error',
        data: {
          error: err instanceof Error ? err.message : 'internal server error',
        },
      })
      ctx.sse?.end()
    }
  })()
}
