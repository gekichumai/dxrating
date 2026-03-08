import { initSentry } from './lib/functions/sentry.js'
initSentry()

import { serve as nodeServe } from '@hono/node-server'
import { app } from './app.js'
import { config } from './config.js'

const port = config.port
console.log(`Server is running on port ${port}`)

nodeServe({
  fetch: app.fetch,
  port,
})