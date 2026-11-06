// A server built like src/index.ts (lifecycle.serve under runMain, which turns SIGTERM into scope closure, and the
// refuseWhileDraining middleware), with a slow route, for the graceful shutdown test in src/test/shutdown.test.ts.
import { runMain } from '@effect/platform-node/NodeRuntime'
import { Effect } from 'effect'
import { Hono } from 'hono'
import type { AddressInfo } from 'node:net'
import { refuseWhileDraining, serve } from '../../lifecycle'

const SLOW_MS = Number(process.env.SLOW_MS ?? 1500)

const app = new Hono()
app.use('*', refuseWhileDraining)
app.get('/health', (c) => c.json({ status: 'ok' }))
app.get('/slow', async (c) => {
  await new Promise((resolve) => setTimeout(resolve, SLOW_MS))
  return c.text('completed')
})

runMain(
  Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(() => process.stdout.write('DRAINED\n')))
      const server = yield* serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
      process.stdout.write(`READY ${(server.address() as AddressInfo).port}\n`)
      return yield* Effect.never
    }),
  ),
)