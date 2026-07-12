import { initLogger, type DrainContext, type DrainFn } from 'evlog'
import { createAxiomDrain } from 'evlog/axiom'
import { createSentryDrain } from 'evlog/sentry'
import { config } from './config.js'

const isProduction = config.nodeEnv === 'production'
const hasAxiomConfig = Boolean(config.axiom.apiKey && config.axiom.dataset)

initLogger({
  env: {
    service: 'dxrating-backend',
    environment: config.nodeEnv,
  },
  pretty: !isProduction,
})

const drains: DrainFn[] = []

if (isProduction || hasAxiomConfig) {
  drains.push(createAxiomDrain())
}

if (isProduction) {
  drains.push(createSentryDrain())
}

export const drain: DrainFn | undefined =
  drains.length > 0
    ? async (ctx: DrainContext) => {
        const results = await Promise.allSettled(drains.map((configuredDrain) => configuredDrain(ctx)))
        for (const result of results) {
          if (result.status === 'rejected') {
            console.error('[evlog] drain failed:', result.reason)
          }
        }
      }
    : undefined