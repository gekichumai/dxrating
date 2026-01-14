// Initialize Sentry first, before any other imports
import { initSentry } from './lib/sentry'
initSentry()

import cors from '@koa/cors'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import KoaSSE from 'koa-event-stream'
import Router from 'koa-router'
import { z } from 'zod'
import {
  v0Handler as fetchNetRecordsV0Handler,
  v1Handler as fetchNetRecordsV1Handler,
} from './functions/fetch-net-records'
import { fetchPlayerByQQ, fetchScoresByFriendCode } from './functions/fetch-lxns-data'
import { handler as oneshotRendererHandler } from './functions/oneshot-renderer'
import type { AuthParams } from './lib/client'
import { Sentry } from './lib/sentry'

const app = new Koa()
const router = new Router()

const authParamsSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1),
  region: z.enum(['jp', 'intl']),
})

Sentry.setupKoaErrorHandler(app)

router.get('/', async (ctx) => {
  ctx.body = {
    message: 'みるく is up and running! 🥛',
    _self: 'https://github.com/gekichumai/dxrating/tree/main/packages/self-hosted-functions',
  }
})

const verifyParams: Koa.Middleware = async (ctx, next) => {
  try {
    // Create a partial schema for the request body
    const requestBodySchema = z.object({
      id: z.string().optional(),
      password: z.string().optional(),
      region: z.string().optional(),
    })

    const body = requestBodySchema.parse((ctx.request as any).body)
    const region = ctx.params.region ?? body.region

    const result = authParamsSchema.parse({
      id: body.id,
      password: body.password,
      region,
    })

    ctx.state.authParams = {
      id: result.id,
      password: result.password,
    } as AuthParams
    ctx.state.region = result.region
    return next()
  } catch (err) {
    if (err instanceof z.ZodError) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid parameters',
        details: (err as any).errors,
      }
      return
    }
    throw err
  }
}

router.post('/functions/fetch-net-records/v0', verifyParams as any, fetchNetRecordsV0Handler as any)
router.post(
  '/functions/fetch-net-records/v1/:region',
  KoaSSE() as any,
  verifyParams as any,
  fetchNetRecordsV1Handler as any,
)

// LXNS API routes
router.get('/functions/fetch-lxns-data/player/qq/:qq', fetchPlayerByQQ as any)
router.get('/functions/fetch-lxns-data/player/:friendCode/scores', fetchScoresByFriendCode as any)

router.post('/functions/render-oneshot/v0', oneshotRendererHandler as any)
if (process.env.DEV === 'true') {
  router.get('/functions/render-oneshot/v0/demo', oneshotRendererHandler as any)
}

app.use(cors())
app.use(bodyParser({ enableTypes: ['json'] }))
app.use(router.routes())
app.use(router.allowedMethods())

app.listen(process.env.PORT ?? 3000)
