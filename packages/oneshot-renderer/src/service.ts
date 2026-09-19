import { createHash } from 'node:crypto'
import { ByteCache } from './cache.js'
import { normalizeWidth } from './dimensions.js'
import type { RenderOptions, RenderResult } from './types.js'

export class RenderQueueFullError extends Error {
  constructor() {
    super('The image renderer is busy; please retry shortly.')
    this.name = 'RenderQueueFullError'
  }
}

export function createRenderService<TInput>(
  render: (input: TInput, options: RenderOptions) => Promise<RenderResult>,
  {
    maxConcurrent = 1,
    maxQueued = 8,
    cacheMaxBytes = 32 * 1024 * 1024,
    cacheTtlMs = 5 * 60 * 1000,
    now = Date.now,
  } = {},
) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || !Number.isInteger(maxQueued) || maxQueued < 0) {
    throw new RangeError('Invalid render queue limits')
  }
  const cache = new ByteCache<RenderResult>(cacheMaxBytes, cacheTtlMs, now, 32)
  const pending = new Map<string, Promise<RenderResult>>()
  const queue: (() => void)[] = []
  let active = 0

  return async (input: TInput, options: RenderOptions = {}) => {
    const format = options.format ?? 'svg'
    const normalized = { format, width: format === 'svg' ? undefined : normalizeWidth(options.width) }
    const key = createHash('sha256')
      .update(JSON.stringify([input, normalized]))
      .digest('hex')
    const cached = cache.get(key)
    if (cached) return { ...cached, cache: 'HIT' as const }
    const existing = pending.get(key)
    if (existing) return { ...(await existing), cache: 'COALESCED' as const }
    if (active >= maxConcurrent && queue.length >= maxQueued) throw new RenderQueueFullError()

    const promise = (async () => {
      if (active >= maxConcurrent) await new Promise<void>((resolve) => queue.push(resolve))
      else active++
      try {
        const result = await render(input, normalized)
        cache.set(
          key,
          result,
          typeof result.body === 'string' ? Buffer.byteLength(result.body) : result.body.byteLength,
        )
        return result
      } finally {
        const next = queue.shift()
        if (next) next()
        else active--
      }
    })()
    pending.set(key, promise)
    try {
      return { ...(await promise), cache: 'MISS' as const }
    } finally {
      pending.delete(key)
    }
  }
}