import { serve } from '@hono/node-server'
import { createAdminApiApp } from './app'
import { envSchema } from './config'
import { AdminDatabase } from './db'
import { Effect } from 'effect'
import { adminApiLayer, makeAdminApiRuntime } from './runtime'

const config = envSchema.parse(process.env)
const runtime = makeAdminApiRuntime(adminApiLayer(config))
const server = serve({ fetch: createAdminApiApp(runtime).fetch, port: config.PORT }, (info) => {
  console.log(`admin-api listening on ${info.port}`)
  // One database check at startup, so the deploy log says at once whether the database is reachable
  void runtime.runPromise(Effect.flatMap(AdminDatabase, (db) => db.ping)).catch(() => undefined)
})

const shutdown = () => server.close(() => void runtime.dispose().then(() => process.exit(0)))
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)