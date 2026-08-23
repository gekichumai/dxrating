import { initSentry } from './lib/functions/sentry.js'
initSentry()

import './logger.js'
import { serve as nodeServe } from '@hono/node-server'
import { app } from './app.js'
import { config } from './config.js'

const port = config.port
console.log(`Server is running on port ${port}`)
console.log(
  `Super-administrator allowlist validated (${config.auth.superAdministrators.configuredUserCount} configured)`,
)

nodeServe({
  fetch: app.fetch,
  port,
})