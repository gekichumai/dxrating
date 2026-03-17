import { initLogger } from 'evlog'
import { createSentryDrain } from 'evlog/sentry'
import { config } from './config.js'

const isProduction = config.nodeEnv === 'production'

initLogger({
  env: {
    service: 'dxrating-backend',
    environment: config.nodeEnv,
  },
  pretty: !isProduction,
})

export const drain = isProduction ? createSentryDrain() : undefined