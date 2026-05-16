export type ServerTimingSpan = {
  name: string
  startedAt: number
}

export type ServerTimingMetric = {
  name: string
  duration: number
}

const SERVER_TIMING_TOKEN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/

export const startServerTimingSpan = (name: string, now = performance.now()): ServerTimingSpan => ({
  name,
  startedAt: now,
})

export const finishServerTimingSpan = (span: ServerTimingSpan, now = performance.now()): ServerTimingMetric => ({
  name: span.name,
  duration: Math.max(0, now - span.startedAt),
})

export const formatServerTimingHeader = (metrics: Array<ServerTimingMetric>) =>
  metrics
    .map(({ name, duration }) => {
      if (!SERVER_TIMING_TOKEN.test(name)) {
        throw new Error(`Invalid Server-Timing metric name: ${name}`)
      }

      return `${name};dur=${duration.toFixed(1)}`
    })
    .join(', ')

export const setServerTimingHeader = (headers: Headers, metrics: Array<ServerTimingMetric>) => {
  const nextValue = formatServerTimingHeader(metrics)
  const currentValue = headers.get('Server-Timing')

  headers.set('Server-Timing', currentValue ? `${currentValue}, ${nextValue}` : nextValue)
}