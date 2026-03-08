import { initSentry } from './lib/functions/sentry'
initSentry()

import { serve as nodeServe } from '@hono/node-server'
import { app } from './app'
import { config } from './config'

const port = config.port
console.log(`Server is running on port ${port}`)

nodeServe({
  fetch: app.fetch,
  port,
})
